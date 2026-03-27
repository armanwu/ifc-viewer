const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { Worker } = require('worker_threads');
const path = require('path');
const fs   = require('fs');

let mainWindow;
let ifcAPI  = null;
let WebIFC  = null;
let modelId = null;

// Index relasi properti (dibangun saat model dibuka)
let relPropIndex = {}; // elemId → [{pId, pTipe}]

async function inisialisasiIFC() {
  WebIFC = require(path.join(__dirname, 'node_modules', 'web-ifc', 'web-ifc-api-node.js'));
  ifcAPI = new WebIFC.IfcAPI();
  ifcAPI.SetWasmPath(path.join(__dirname, 'node_modules', 'web-ifc') + path.sep, true);
  await ifcAPI.Init();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1500, height: 880, minWidth: 1100, minHeight: 650,
    title: 'IFC Viewer Indonesia',
    backgroundColor: '#f0f0f0',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });
  mainWindow.loadFile('index.html');
}

// ── Bangun index relasi properti ─────────────────────────────────────────────
function bangunRelPropIndex() {
  relPropIndex = {};
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
          if (!relPropIndex[id]) relPropIndex[id] = [];
          relPropIndex[id].push({ pId, pTipe });
        }
      } catch(e) {}
    }
  } catch(e) {}
}

// ── Baca entry quantity (inline atau referensi) ───────────────────────────────
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
const LEN_PROPS  = ['length','height','width','perimeter'];

// ── Query properti + kuantitas elemen ────────────────────────────────────────
ipcMain.handle('ambil-properti', async (_, expressId) => {
  if (modelId === null || !ifcAPI) return null;
  try {
    const tipe = ifcAPI.GetNameFromTypeCode(ifcAPI.GetLineType(modelId, expressId));
    const line = ifcAPI.GetLine(modelId, expressId, true);
    const props = {
      'Tipe IFC':   tipe ?? '-',
      'Express ID': expressId,
      'Nama':       line.Name?.value ?? '-',
      'Deskripsi':  line.Description?.value ?? '-',
      'GUID':       line.GlobalId?.value ?? '-',
    };
    if (line.ObjectType?.value)  props['Tipe Objek'] = line.ObjectType.value;
    if (line.LongName?.value)    props['Nama Panjang'] = line.LongName.value;

    // Kumpulkan semua properti & kuantitas dari pset
    const kuantitas = []; // {nama, nilai, satuan, grup}
    const properties = []; // {nama, nilai, grup}

    for (const { pId, pTipe } of (relPropIndex[expressId] || [])) {
      try {
        const pset = ifcAPI.GetLine(modelId, pId, true);
        const grupNama = pset.Name?.value ?? '-';

        // Format 1: IfcElementQuantity → Quantities
        if (pTipe === WebIFC.IFCELEMENTQUANTITY && pset.Quantities) {
          const qs = Array.isArray(pset.Quantities) ? pset.Quantities : [pset.Quantities];
          for (const q of qs) {
            const qLine = bacaQty(q);
            if (!qLine) continue;
            const nama = qLine.Name?.value ?? '';
            if (qLine.AreaValue?.value !== undefined)
              kuantitas.push({ nama, nilai: qLine.AreaValue.value.toFixed(3), satuan: 'm²', grup: grupNama });
            if (qLine.VolumeValue?.value !== undefined)
              kuantitas.push({ nama, nilai: qLine.VolumeValue.value.toFixed(3), satuan: 'm³', grup: grupNama });
            if (qLine.LengthValue?.value !== undefined)
              kuantitas.push({ nama, nilai: qLine.LengthValue.value.toFixed(3), satuan: 'm', grup: grupNama });
            if (qLine.WeightValue?.value !== undefined)
              kuantitas.push({ nama, nilai: qLine.WeightValue.value.toFixed(3), satuan: 'kg', grup: grupNama });
          }
        }

        // Format 2: IfcPropertySet → HasProperties (Revit style)
        if (pTipe === WebIFC.IFCPROPERTYSET && pset.HasProperties) {
          const ps = Array.isArray(pset.HasProperties) ? pset.HasProperties : [pset.HasProperties];
          for (const p of ps) {
            const pLine = bacaQty(p);
            if (!pLine) continue;
            const nama      = pLine.Name?.value ?? '';
            const namaLower = nama.toLowerCase();
            const val       = pLine.NominalValue?.value;
            if (val === null || val === undefined) continue;

            // Angka → kuantitas
            if (typeof val === 'number' && val > 0) {
              if (AREA_PROPS.includes(namaLower))
                kuantitas.push({ nama, nilai: val.toFixed(3), satuan: 'm²', grup: grupNama });
              else if (VOL_PROPS.includes(namaLower))
                kuantitas.push({ nama, nilai: val.toFixed(3), satuan: 'm³', grup: grupNama });
              else if (LEN_PROPS.includes(namaLower))
                kuantitas.push({ nama, nilai: val.toFixed(3), satuan: 'm', grup: grupNama });
              else
                properties.push({ nama, nilai: String(val), grup: grupNama });
            } else {
              // String / boolean → properties biasa
              properties.push({ nama, nilai: String(val), grup: grupNama });
            }
          }
        }
      } catch(e) {}
    }

    return { props, kuantitas, properties };
  } catch(e) {
    return { props: { 'Express ID': expressId, 'Error': e.message }, kuantitas: [], properties: [] };
  }
});

// ── Buka & parse IFC via Worker Thread ───────────────────────────────────────
ipcMain.handle('buka-dan-parse-ifc', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Pilih File IFC',
    filters: [{ name: 'File IFC', extensions: ['ifc'] }],
    properties: ['openFile']
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];

  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, 'ifc-worker.js'), {
      workerData: {
        filePath,
        wasmDir: path.join(__dirname, 'node_modules', 'web-ifc'),
        mainDir: __dirname
      }
    });

    worker.on('message', async (msg) => {
      if (msg.tipe === 'status') {
        mainWindow.webContents.send('loading-status', msg.pesan);
      } else if (msg.tipe === 'selesai') {
        try {
          if (modelId !== null) { try { ifcAPI.CloseModel(modelId); } catch(e) {} modelId = null; }
          const bytes = new Uint8Array(fs.readFileSync(filePath));
          modelId = ifcAPI.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true, USE_FAST_BOOLS: false });
          bangunRelPropIndex(); // bangun index sekali untuk query cepat
        } catch(e) { console.warn('Gagal buka model di main thread:', e.message); }
        resolve(msg.hasil);
      } else if (msg.tipe === 'error') {
        reject(new Error(msg.pesan));
      }
    });

    worker.on('error', reject);
    worker.on('exit', (code) => { if (code !== 0) reject(new Error(`Worker exit ${code}`)); });
  });
});

app.whenReady().then(async () => { await inisialisasiIFC(); createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
