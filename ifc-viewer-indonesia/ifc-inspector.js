// Script inspeksi: jalankan dengan node ifc-inspector.js /path/to/file.ifc
const WebIFC = require('./node_modules/web-ifc/web-ifc-api-node.js');
const fs = require('fs'), path = require('path');

const filePath = process.argv[2];
if (!filePath) { console.log('Usage: node ifc-inspector.js file.ifc'); process.exit(1); }

const api = new WebIFC.IfcAPI();
api.SetWasmPath(path.join(__dirname, 'node_modules', 'web-ifc') + path.sep, true);

api.Init().then(() => {
  const bytes = new Uint8Array(fs.readFileSync(filePath));
  const modelId = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });
  
  console.log('\n=== SEMUA TIPE KUANTITAS ===');
  const qTypes = [WebIFC.IFCQUANTITYAREA, WebIFC.IFCQUANTITYLENGTH, WebIFC.IFCQUANTITYVOLUME, WebIFC.IFCELEMENTQUANTITY];
  for (const t of qTypes) {
    const ids = api.GetLineIDsWithType(modelId, t);
    const nama = api.GetNameFromTypeCode(t);
    console.log(`${nama}: ${ids.size()} buah`);
    // Tampilkan 3 contoh
    for (let i = 0; i < Math.min(ids.size(), 3); i++) {
      try {
        const line = api.GetLine(modelId, ids.get(i), true);
        console.log(`  [${ids.get(i)}] Name=${line.Name?.value} AreaValue=${line.AreaValue?.value} LengthValue=${line.LengthValue?.value} VolumeValue=${line.VolumeValue?.value}`);
      } catch(e) {}
    }
  }

  console.log('\n=== IFCELEMENTQUANTITY - ISI QUANTITIES ===');
  const eqIds = api.GetLineIDsWithType(modelId, WebIFC.IFCELEMENTQUANTITY);
  for (let i = 0; i < Math.min(eqIds.size(), 5); i++) {
    const eq = api.GetLine(modelId, eqIds.get(i), true);
    console.log(`\nEQ[${eqIds.get(i)}] Name=${eq.Name?.value} MethodOfMeasurement=${eq.MethodOfMeasurement?.value}`);
    if (eq.Quantities) {
      const qs = Array.isArray(eq.Quantities) ? eq.Quantities : [eq.Quantities];
      for (const q of qs) {
        // q bisa inline atau referensi
        let qLine = (q?.expressID !== undefined) ? q : null;
        if (!qLine && q?.value) { try { qLine = api.GetLine(modelId, q.value, true); } catch(e) {} }
        if (!qLine) continue;
        const tipeNama = api.GetNameFromTypeCode(qLine.type ?? api.GetLineType(modelId, qLine.expressID));
        console.log(`  Q: ${tipeNama} | Name=${qLine.Name?.value} | Area=${qLine.AreaValue?.value} | Len=${qLine.LengthValue?.value} | Vol=${qLine.VolumeValue?.value}`);
      }
    }
  }

  console.log('\n=== PSET WALL - SAMPLE ===');
  const wallIds = api.GetLineIDsWithType(modelId, WebIFC.IFCWALL);
  const wallStdIds = api.GetLineIDsWithType(modelId, WebIFC.IFCWALLSTANDARDCASE);
  const allWalls = [];
  for (let i = 0; i < wallIds.size(); i++) allWalls.push(wallIds.get(i));
  for (let i = 0; i < wallStdIds.size(); i++) allWalls.push(wallStdIds.get(i));
  console.log(`Total dinding: ${allWalls.length}`);

  if (allWalls.length > 0) {
    const wallId = allWalls[0];
    console.log(`\nDinding pertama ID: ${wallId}`);
    const relIds = api.GetLineIDsWithType(modelId, WebIFC.IFCRELDEFINESBYPROPERTIES);
    for (let i = 0; i < relIds.size(); i++) {
      try {
        const rel = api.GetLine(modelId, relIds.get(i), true);
        const objs = rel.RelatedObjects;
        const arr = Array.isArray(objs) ? objs : [objs];
        if (!arr.some(o => (o?.value ?? o) === wallId)) continue;
        const psetRef = rel.RelatingPropertyDefinition;
        const psetId = psetRef?.value ?? psetRef?.expressID;
        if (!psetId) continue;
        const psetTipe = api.GetLineType(modelId, psetId);
        const psetNama = api.GetNameFromTypeCode(psetTipe);
        const pset = api.GetLine(modelId, psetId, true);
        console.log(`\n  Pset[${psetId}] type=${psetNama} Name=${pset.Name?.value}`);
        
        // Quantities
        if (pset.Quantities) {
          const qs = Array.isArray(pset.Quantities) ? pset.Quantities : [pset.Quantities];
          console.log(`  Quantities (${qs.length}):`);
          for (const q of qs) {
            let qLine = (q?.expressID !== undefined) ? q : null;
            if (!qLine && q?.value) { try { qLine = api.GetLine(modelId, q.value, true); } catch(e) {} }
            if (!qLine) { console.log('    (null entry)'); continue; }
            console.log(`    ${qLine.Name?.value}: Area=${qLine.AreaValue?.value} Len=${qLine.LengthValue?.value} Vol=${qLine.VolumeValue?.value}`);
          }
        }
        
        // HasProperties
        if (pset.HasProperties) {
          const ps = Array.isArray(pset.HasProperties) ? pset.HasProperties : [pset.HasProperties];
          console.log(`  HasProperties (${ps.length}):`);
          for (const p of ps) {
            let pLine = (p?.expressID !== undefined) ? p : null;
            if (!pLine && p?.value) { try { pLine = api.GetLine(modelId, p.value, true); } catch(e) {} }
            if (!pLine) continue;
            const nomVal = pLine.NominalValue;
            if (nomVal?.value !== undefined) {
              console.log(`    ${pLine.Name?.value}: ${nomVal.value} (${nomVal.name ?? nomVal.type})`);
            }
          }
        }
      } catch(e) {}
    }
  }

  api.CloseModel(modelId);
}).catch(e => console.error('Error:', e));
