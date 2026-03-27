const { workerData, parentPort } = require('worker_threads');
const path = require('path');
const fs   = require('fs');

async function jalankan() {
  const { filePath, wasmDir, mainDir } = workerData;
  parentPort.postMessage({ tipe: 'status', pesan: 'Inisialisasi parser IFC...' });

  const WebIFC = require(path.join(mainDir, 'node_modules', 'web-ifc', 'web-ifc-api-node.js'));
  const ifcAPI = new WebIFC.IfcAPI();
  ifcAPI.SetWasmPath(wasmDir + path.sep, true);
  await ifcAPI.Init();

  parentPort.postMessage({ tipe: 'status', pesan: 'Membaca file IFC...' });
  const bytes    = new Uint8Array(fs.readFileSync(filePath));
  const fileName = path.basename(filePath);
  parentPort.postMessage({ tipe: 'status', pesan: `Membuka model (${(bytes.length/1024/1024).toFixed(1)} MB)...` });

  const modelId = ifcAPI.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: false });

  parentPort.postMessage({ tipe: 'status', pesan: 'Membaca geometri 3D...' });

  // Geometri: simpan per expressId untuk kalkulasi
  const meshList = [];
  const geomPerElemen = {};

  ifcAPI.StreamAllMeshes(modelId, (mesh) => {
    const expId = mesh.expressID;
    const count = mesh.geometries.size();
    for (let i = 0; i < count; i++) {
      const pg       = mesh.geometries.get(i);
      const geomData = ifcAPI.GetGeometry(modelId, pg.geometryExpressID);
      const vSize    = geomData.GetVertexDataSize();
      const iSize    = geomData.GetIndexDataSize();
      if (vSize === 0 || iSize === 0) { geomData.delete(); continue; }
      const vArr = Array.from(ifcAPI.GetVertexArray(geomData.GetVertexData(), vSize));
      const iArr = Array.from(ifcAPI.GetIndexArray(geomData.GetIndexData(),  iSize));
      const t    = Array.from(pg.flatTransformation);
      meshList.push({
        expressId: expId,
        color: { r: pg.color.x, g: pg.color.y, b: pg.color.z, a: pg.color.w },
        vertices: vArr, indices: iArr, transform: t
      });
      if (!geomPerElemen[expId]) geomPerElemen[expId] = [];
      geomPerElemen[expId].push({ vertices: vArr, indices: iArr, transform: t });
      geomData.delete();
    }
  });

  parentPort.postMessage({ tipe: 'status', pesan: `${meshList.length} mesh. Membaca struktur bangunan...` });

  // ── Jenis elemen global ───────────────────────────────────────────────────
  const TIPE_IFC = ['IfcWall','IfcWallStandardCase','IfcSlab','IfcBeam','IfcColumn',
    'IfcDoor','IfcWindow','IfcRoof','IfcStair','IfcFurnishingElement',
    'IfcFlowSegment','IfcMember','IfcPlate','IfcSpace','IfcCovering'];
  const jenisElemen = {};
  for (const tipe of TIPE_IFC) {
    try {
      const kode = WebIFC[tipe.toUpperCase()];
      if (!kode) continue;
      const ids = ifcAPI.GetLineIDsWithType(modelId, kode);
      if (ids.size() > 0) jenisElemen[tipe] = ids.size();
    } catch(e) {}
  }

  // ── Bangun peta storey: storeyId → {nama, elevasi, elemIds[]} ─────────────
  parentPort.postMessage({ tipe: 'status', pesan: 'Membaca level lantai...' });

  const storeyMap = {}; // storeyId → { nama, elevasi, elemIds: Set }

  // Ambil semua IfcBuildingStorey
  try {
    const storeyIds = ifcAPI.GetLineIDsWithType(modelId, WebIFC.IFCBUILDINGSTOREY);
    for (let i = 0; i < storeyIds.size(); i++) {
      const sId = storeyIds.get(i);
      try {
        const s = ifcAPI.GetLine(modelId, sId, true);
        storeyMap[sId] = {
          nama:     s.Name?.value ?? s.LongName?.value ?? `Level ${i+1}`,
          elevasi:  s.Elevation?.value ?? 0,
          elemIds:  new Set()
        };
      } catch(e) {}
    }
  } catch(e) {}

  // Hubungkan elemen ke storey via IfcRelContainedInSpatialStructure
  try {
    const relConIds = ifcAPI.GetLineIDsWithType(modelId, WebIFC.IFCRELCONTAINEDINSPATIALSTRUCTURE);
    for (let i = 0; i < relConIds.size(); i++) {
      try {
        const rel      = ifcAPI.GetLine(modelId, relConIds.get(i), true);
        const strucRef = rel.RelatingStructure;
        const strucId  = strucRef?.value ?? strucRef?.expressID;
        if (!strucId || !storeyMap[strucId]) continue;
        const elems = rel.RelatedElements;
        if (!elems) continue;
        const arr = Array.isArray(elems) ? elems : [elems];
        for (const e of arr) {
          const eId = e?.value ?? e?.expressID ?? e;
          if (typeof eId === 'number') storeyMap[strucId].elemIds.add(eId);
        }
      } catch(e) {}
    }
  } catch(e) {}

  // Hubungkan space ke storey via IfcRelAggregates (ruangan sering aggregate ke storey)
  try {
    const relAggIds = ifcAPI.GetLineIDsWithType(modelId, WebIFC.IFCRELAGGREGATES);
    for (let i = 0; i < relAggIds.size(); i++) {
      try {
        const rel      = ifcAPI.GetLine(modelId, relAggIds.get(i), true);
        const relObj   = rel.RelatingObject;
        const relObjId = relObj?.value ?? relObj?.expressID;
        if (!relObjId || !storeyMap[relObjId]) continue;
        const objs = rel.RelatedObjects;
        if (!objs) continue;
        const arr = Array.isArray(objs) ? objs : [objs];
        for (const e of arr) {
          const eId = e?.value ?? e?.expressID ?? e;
          if (typeof eId === 'number') storeyMap[relObjId].elemIds.add(eId);
        }
      } catch(e) {}
    }
  } catch(e) {}

  // ── Bangun index relasi properti ─────────────────────────────────────────
  const relPropMap = {};
  try {
    const relIds = ifcAPI.GetLineIDsWithType(modelId, WebIFC.IFCRELDEFINESBYPROPERTIES);
    for (let i = 0; i < relIds.size(); i++) {
      try {
        const rel  = ifcAPI.GetLine(modelId, relIds.get(i), true);
        const pRef = rel.RelatingPropertyDefinition;
        const pId  = pRef?.value ?? pRef?.expressID;
        if (!pId) continue;
        const pTipe = ifcAPI.GetLineType(modelId, pId);
        const objs  = rel.RelatedObjects;
        if (!objs) continue;
        const arr = Array.isArray(objs) ? objs : [objs];
        for (const o of arr) {
          const id = o?.value ?? o?.expressID ?? o;
          if (typeof id !== 'number') continue;
          if (!relPropMap[id]) relPropMap[id] = [];
          relPropMap[id].push({ pId, pTipe });
        }
      } catch(e) {}
    }
  } catch(e) {}

  // ── Helper baca quantity entry ────────────────────────────────────────────
  const bacaQty = (entry) => {
    if (!entry) return null;
    if (entry.expressID !== undefined) return entry;
    if (entry?.value && typeof entry.value === 'number') {
      try { return ifcAPI.GetLine(modelId, entry.value, true); } catch(e) {}
    }
    return null;
  };

  const AREA_PROPS = ['area','netarea','grossarea','netsidearea','grosssidearea',
    'netfloorarea','grossfloorarea','netsurface','grosssurface',
    'netceilingarea','grossceilingarea','netfootprintarea'];
  const VOL_PROPS  = ['volume','netvolume','grossvolume'];

  const ambilKuantitasElemen = (elemId) => {
    let area = 0, vol = 0;
    for (const { pId, pTipe } of (relPropMap[elemId] || [])) {
      try {
        const pset = ifcAPI.GetLine(modelId, pId, true);
        if (pTipe === WebIFC.IFCELEMENTQUANTITY && pset.Quantities) {
          const qs = Array.isArray(pset.Quantities) ? pset.Quantities : [pset.Quantities];
          for (const q of qs) {
            const qLine = bacaQty(q);
            if (!qLine) continue;
            if (qLine.AreaValue?.value)   area += qLine.AreaValue.value;
            if (qLine.VolumeValue?.value) vol  += qLine.VolumeValue.value;
          }
        }
        if (pTipe === WebIFC.IFCPROPERTYSET && pset.HasProperties) {
          const ps = Array.isArray(pset.HasProperties) ? pset.HasProperties : [pset.HasProperties];
          for (const p of ps) {
            const pLine = bacaQty(p);
            if (!pLine) continue;
            const namaLower = (pLine.Name?.value ?? '').toLowerCase();
            const val = pLine.NominalValue?.value;
            if (typeof val !== 'number' || val <= 0) continue;
            if (AREA_PROPS.includes(namaLower)) area += val;
            if (VOL_PROPS.includes(namaLower))  vol  += val;
          }
        }
      } catch(e) {}
    }
    return { area, vol };
  };

  // ── Hitung geometri 3D ────────────────────────────────────────────────────
  const transformPt = (x, y, z, t) => ({
    x: t[0]*x + t[4]*y + t[8]*z  + t[12],
    y: t[1]*x + t[5]*y + t[9]*z  + t[13],
    z: t[2]*x + t[6]*y + t[10]*z + t[14]
  });
  const luasSegitiga = (a, b, c) => {
    const ab = {x:b.x-a.x, y:b.y-a.y, z:b.z-a.z};
    const ac = {x:c.x-a.x, y:c.y-a.y, z:c.z-a.z};
    const cr = {x:ab.y*ac.z-ab.z*ac.y, y:ab.z*ac.x-ab.x*ac.z, z:ab.x*ac.y-ab.y*ac.x};
    return 0.5 * Math.sqrt(cr.x*cr.x + cr.y*cr.y + cr.z*cr.z);
  };
  const volTetra = (a, b, c) =>
    (a.x*(b.y*c.z-b.z*c.y) + a.y*(b.z*c.x-b.x*c.z) + a.z*(b.x*c.y-b.y*c.x)) / 6;

  const hitungGeomElemen = (expId) => {
    let area = 0, vol = 0;
    for (const g of (geomPerElemen[expId] || [])) {
      const v = g.vertices, idx = g.indices, t = g.transform;
      for (let i = 0; i < idx.length; i += 3) {
        const i0=idx[i]*6, i1=idx[i+1]*6, i2=idx[i+2]*6;
        const a = transformPt(v[i0], v[i0+1], v[i0+2], t);
        const b = transformPt(v[i1], v[i1+1], v[i1+2], t);
        const c = transformPt(v[i2], v[i2+1], v[i2+2], t);
        area += luasSegitiga(a, b, c);
        vol  += volTetra(a, b, c);
      }
    }
    return { area: area/2, vol: Math.abs(vol) };
  };

  // ── Tipe kode yang relevan per kategori ──────────────────────────────────
  const KODE_DINDING  = [WebIFC.IFCWALL, WebIFC.IFCWALLSTANDARDCASE].filter(Boolean);
  const KODE_LANTAI   = [WebIFC.IFCSLAB].filter(Boolean);
  const KODE_PINTU    = [WebIFC.IFCDOOR].filter(Boolean);
  const KODE_JENDELA  = [WebIFC.IFCWINDOW].filter(Boolean);

  // ── Hitung kalkulasi untuk sekumpulan elemIds ─────────────────────────────
  parentPort.postMessage({ tipe: 'status', pesan: 'Menghitung per level...' });

  const hitungKumpulanElem = (elemIds, kodeDinding, kodeLantai, kodeP, kodeJ) => {
    let areaDinding=0, volDinding=0, areaLantai=0, volLantai=0,
        areaCeiling=0, volCeiling=0, pintu=0, jendela=0, sumberData='IFC Properties';

    const dindingIds = new Set(), lantaiIds = new Set();
    const pintuIds   = new Set(), jendelaIds = new Set();

    for (const id of elemIds) {
      try {
        const tipe = ifcAPI.GetLineType(modelId, id);
        if (kodeDinding.includes(tipe))  dindingIds.add(id);
        else if (kodeLantai.includes(tipe)) lantaiIds.add(id);
        else if (kodeP.includes(tipe))   pintuIds.add(id);
        else if (kodeJ.includes(tipe))   jendelaIds.add(id);
        // Ceiling dari IfcCovering
        else if (tipe === WebIFC.IFCCOVERING) {
          try {
            const cov = ifcAPI.GetLine(modelId, id, true);
            const pt  = cov.PredefinedType?.value ?? '';
            if (['CEILING','CLADDING','ROOFING'].includes(pt)) {
              const r = ambilKuantitasElemen(id);
              if (r.area > 0) { areaCeiling += r.area; volCeiling += r.vol; }
              else { const g = hitungGeomElemen(id); areaCeiling += g.area; volCeiling += g.vol; sumberData='Geometri 3D'; }
            }
          } catch(e) {}
        }
      } catch(e) {}
    }

    pintu   = pintuIds.size;
    jendela = jendelaIds.size;

    for (const id of dindingIds) {
      const r = ambilKuantitasElemen(id);
      if (r.area > 0) { areaDinding += r.area; volDinding += r.vol; }
      else { const g = hitungGeomElemen(id); areaDinding += g.area; volDinding += g.vol; sumberData='Geometri 3D'; }
    }
    for (const id of lantaiIds) {
      const r = ambilKuantitasElemen(id);
      if (r.area > 0) { areaLantai += r.area; volLantai += r.vol; }
      else { const g = hitungGeomElemen(id); areaLantai += g.area; volLantai += g.vol; sumberData='Geometri 3D'; }
    }

    return { areaDinding, volDinding, areaLantai, volLantai, areaCeiling, volCeiling, pintu, jendela, sumberData };
  };

  // ── Hitung per storey ─────────────────────────────────────────────────────
  const levels = [];
  const storeysSorted = Object.entries(storeyMap)
    .sort((a, b) => (a[1].elevasi ?? 0) - (b[1].elevasi ?? 0));

  for (const [sId, storey] of storeysSorted) {
    const k = hitungKumpulanElem(storey.elemIds, KODE_DINDING, KODE_LANTAI, KODE_PINTU, KODE_JENDELA);
    levels.push({ nama: storey.nama, elevasi: storey.elevasi, jumlahElem: storey.elemIds.size, ...k });
  }

  // ── Hitung total semua elemen (tidak hanya yang masuk storey) ────────────
  parentPort.postMessage({ tipe: 'status', pesan: 'Menghitung total...' });

  // Kumpulkan semua elemId dari semua geometri
  const semuaElemId = new Set(Object.keys(geomPerElemen).map(Number));
  const totalK = hitungKumpulanElem(semuaElemId, KODE_DINDING, KODE_LANTAI, KODE_PINTU, KODE_JENDELA);

  // Sumber data total
  const adaDataIFC = levels.some(l => l.sumberData === 'IFC Properties' && (l.areaDinding > 0 || l.areaLantai > 0));
  const sumberTotal = totalK.sumberData;

  const kalkulasi = {
    total: {
      areaDinding: totalK.areaDinding, volDinding: totalK.volDinding,
      areaLantai:  totalK.areaLantai,  volLantai:  totalK.volLantai,
      areaCeiling: totalK.areaCeiling, volCeiling: totalK.volCeiling,
      pintu: totalK.pintu, jendela: totalK.jendela,
      sumberData: sumberTotal
    },
    levels
  };

  console.log('Levels:', levels.map(l => `${l.nama}: dinding=${l.areaDinding.toFixed(1)}m² lantai=${l.areaLantai.toFixed(1)}m²`));
  ifcAPI.CloseModel(modelId);

  parentPort.postMessage({ tipe: 'selesai', hasil: { nama: fileName, meshList, jenisElemen, kalkulasi } });
}

jalankan().catch(e => parentPort.postMessage({ tipe: 'error', pesan: e.message }));
