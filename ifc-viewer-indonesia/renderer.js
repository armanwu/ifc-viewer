// ============================================================
// IFC Viewer Indonesia — renderer.js
// Three.js rendering + element selection + kalkulasi
// ============================================================

let scene, camera, renderer;
let modelGrup = null;
let wireframeMode = false;
let rotasiX = 30, rotasiY = 45, jarak = 20;
let targetX = 0, targetY = 2, targetZ = 0;

// Seleksi
let meshMap = {};          // expressId -> THREE.Mesh[]
let elemen_dipilih = null; // expressId yang dipilih
let raycaster, mouse;
let semuaMesh = [];        // daftar semua mesh untuk raycast

// ============================================================
// INISIALISASI THREE.JS
// ============================================================
function inisialisasiTiga() {
  const kanvas = document.getElementById('kanvas-3d');
  const vp = document.getElementById('area-viewport');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0xd0d0d0);
  scene.fog = new THREE.Fog(0xd0d0d0, 100, 500);

  camera = new THREE.PerspectiveCamera(55, vp.clientWidth / vp.clientHeight, 0.01, 2000);

  renderer = new THREE.WebGLRenderer({ canvas: kanvas, antialias: true });
  renderer.setSize(vp.clientWidth, vp.clientHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;

  // Pencahayaan: mirip app BIM profesional
  scene.add(new THREE.AmbientLight(0xffffff, 0.7));
  const d1 = new THREE.DirectionalLight(0xffffff, 0.9);
  d1.position.set(60, 120, 80); d1.castShadow = true; scene.add(d1);
  const d2 = new THREE.DirectionalLight(0xd0ddf0, 0.4);
  d2.position.set(-60, 40, -80); scene.add(d2);
  const d3 = new THREE.DirectionalLight(0xfff5e0, 0.2);
  d3.position.set(0, -50, 0); scene.add(d3);

  // Grid
  const grid = new THREE.GridHelper(300, 100, 0xb0b0b0, 0xb0b0b0);
  grid.material.opacity = 0.5; grid.material.transparent = true;
  scene.add(grid);

  // Raycaster untuk seleksi
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  perbaruiKamera();
  setupKontrol(kanvas, vp);

  window.addEventListener('resize', () => {
    camera.aspect = vp.clientWidth / vp.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(vp.clientWidth, vp.clientHeight);
  });

  (function loop() { requestAnimationFrame(loop); renderer.render(scene, camera); })();
}

function perbaruiKamera() {
  const rx = THREE.MathUtils.degToRad(rotasiX);
  const ry = THREE.MathUtils.degToRad(rotasiY);
  camera.position.set(
    targetX + jarak * Math.cos(rx) * Math.sin(ry),
    targetY + jarak * Math.sin(rx),
    targetZ + jarak * Math.cos(rx) * Math.cos(ry)
  );
  camera.lookAt(targetX, targetY, targetZ);
}

// ============================================================
// KONTROL ORBIT + KLIK SELEKSI
// ============================================================
function setupKontrol(kanvas, vp) {
  let drag = false, mx = 0, my = 0, moved = false;

  kanvas.addEventListener('mousedown', e => {
    drag = true; moved = false;
    mx = e.clientX; my = e.clientY;
  });

  window.addEventListener('mouseup', e => {
    if (!moved && drag && e.button === 0) {
      // Klik tanpa seret → seleksi
      const rect = kanvas.getBoundingClientRect();
      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      seleksiElemen(e.clientX, e.clientY);
    }
    drag = false;
  });

  window.addEventListener('mousemove', e => {
    if (!drag) return;
    const dx = e.clientX - mx, dy = e.clientY - my;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) moved = true;
    if (e.buttons === 1) {
      rotasiY += dx * 0.3;
      rotasiX = Math.max(-89, Math.min(89, rotasiX - dy * 0.3));
    } else if (e.buttons === 2) {
      const f = jarak * 0.008;
      targetX -= Math.sin(THREE.MathUtils.degToRad(rotasiY)) * dx * f;
      targetZ -= Math.cos(THREE.MathUtils.degToRad(rotasiY)) * dx * f;
      targetY += dy * f;
    }
    perbaruiKamera(); mx = e.clientX; my = e.clientY;
  });

  kanvas.addEventListener('wheel', e => {
    jarak = Math.max(0.5, Math.min(1000, jarak * (1 + e.deltaY * 0.001)));
    perbaruiKamera();
  });
  kanvas.addEventListener('contextmenu', e => e.preventDefault());
}

// ============================================================
// SELEKSI ELEMEN
// ============================================================
const WARNA_NORMAL = {}; // expressId -> material asli
const WARNA_PILIH = new THREE.MeshLambertMaterial({ color: 0xff4444, transparent: true, opacity: 0.85, side: THREE.DoubleSide });

function seleksiElemen(cx, cy) {
  const rect = document.getElementById('kanvas-3d').getBoundingClientRect();
  mouse.x = ((cx - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((cy - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObjects(semuaMesh, false);

  if (hits.length === 0) {
    // Klik kosong → hapus seleksi
    batalSeleksi();
    document.getElementById('info-seleksi').textContent = '';
    document.getElementById('isi-properti').innerHTML =
      '<div class="kosong-panel">Klik elemen pada model<br>untuk melihat propertinya</div>';
    return;
  }

  const hit = hits[0].object;
  const expressId = hit.userData.expressId;
  if (expressId === elemen_dipilih) return; // klik elemen yang sama

  batalSeleksi();
  pilihElemen(expressId);

  // Ambil properti dari main process
  document.getElementById('isi-properti').innerHTML =
    '<div class="kosong-panel">Memuat properti...</div>';
  bukaTabKanan('properti');

  window.elektronAPI.ambilProperti(expressId).then(data => {
    tampilkanProperti(data, expressId);
  });

  document.getElementById('info-seleksi').textContent = `Dipilih: ID ${expressId}`;
}

function pilihElemen(expressId) {
  elemen_dipilih = expressId;
  const meshes = meshMap[expressId] || [];
  meshes.forEach(m => {
    if (!WARNA_NORMAL[expressId]) WARNA_NORMAL[expressId] = m.material;
    m.material = WARNA_PILIH;
  });
}

function batalSeleksi() {
  if (elemen_dipilih === null) return;
  const meshes = meshMap[elemen_dipilih] || [];
  meshes.forEach(m => {
    if (WARNA_NORMAL[elemen_dipilih]) m.material = WARNA_NORMAL[elemen_dipilih];
  });
  delete WARNA_NORMAL[elemen_dipilih];
  elemen_dipilih = null;
}

// ============================================================
// BANGUN SCENE
// ============================================================
function bangunScene(meshList) {
  if (modelGrup) {
    scene.remove(modelGrup);
    modelGrup.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && !Array.isArray(o.material)) o.material.dispose();
    });
  }
  meshMap = {};
  semuaMesh = [];
  elemen_dipilih = null;
  modelGrup = new THREE.Group();

  for (const data of meshList) {
    const geom = new THREE.BufferGeometry();
    const vArr = new Float32Array(data.vertices);
    const pos = [], norm = [];
    for (let j = 0; j < vArr.length; j += 6) {
      pos.push(vArr[j], vArr[j+1], vArr[j+2]);
      norm.push(vArr[j+3], vArr[j+4], vArr[j+5]);
    }
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
    geom.setIndex(new THREE.BufferAttribute(new Uint32Array(data.indices), 1));

    const mat = new THREE.MeshLambertMaterial({
      color: new THREE.Color(data.color.r, data.color.g, data.color.b),
      transparent: data.color.a < 0.99,
      opacity: data.color.a,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geom, mat);
    const t = data.transform;
    mesh.applyMatrix4(new THREE.Matrix4().set(
      t[0],t[4],t[8],t[12], t[1],t[5],t[9],t[13],
      t[2],t[6],t[10],t[14], t[3],t[7],t[11],t[15]
    ));
    mesh.userData.expressId = data.expressId;
    mesh.castShadow = true;
    mesh.receiveShadow = true;

    if (!meshMap[data.expressId]) meshMap[data.expressId] = [];
    meshMap[data.expressId].push(mesh);
    semuaMesh.push(mesh);
    modelGrup.add(mesh);
  }

  scene.add(modelGrup);

  // Sesuaikan kamera
  const box = new THREE.Box3().setFromObject(modelGrup);
  const center = new THREE.Vector3(); const size = new THREE.Vector3();
  box.getCenter(center); box.getSize(size);
  targetX = center.x; targetY = center.y; targetZ = center.z;
  jarak = Math.max(size.x, size.y, size.z) * 2;
  rotasiX = 30; rotasiY = 45;
  perbaruiKamera();
}

// ============================================================
// TAMPILKAN PROPERTI ELEMEN
// ============================================================
function tampilkanProperti(data, expressId) {
  if (!data) {
    document.getElementById('isi-properti').innerHTML =
      '<div class="kosong-panel">Gagal memuat properti</div>';
    return;
  }

  let html = '';

  // ── Info dasar ──────────────────────────────────────────
  html += '<div class="prop-grup">';
  html += '<div class="prop-grup-judul">Informasi Elemen</div>';
  for (const [k, v] of Object.entries(data.props)) {
    html += `<div class="prop-baris">
      <div class="prop-kunci">${k}</div>
      <div class="prop-nilai">${v}</div>
    </div>`;
  }
  html += '</div>';

  // ── Kuantitas (luas, volume, panjang) ───────────────────
  if (data.kuantitas && data.kuantitas.length > 0) {
    // Kelompokkan per grup (nama pset)
    const grupKuantitas = {};
    for (const q of data.kuantitas) {
      const g = q.grup || 'Kuantitas';
      if (!grupKuantitas[g]) grupKuantitas[g] = [];
      grupKuantitas[g].push(q);
    }

    for (const [grup, items] of Object.entries(grupKuantitas)) {
      html += `<div class="prop-grup">`;
      html += `<div class="prop-grup-judul prop-grup-qty">${grup}</div>`;
      // Tabel ringkas untuk kuantitas
      html += '<table class="prop-tabel-qty">';
      for (const q of items) {
        const ikonSat = q.satuan === 'm²' ? '▣' : q.satuan === 'm³' ? '▪' : q.satuan === 'm' ? '↔' : '';
        html += `<tr>
          <td class="ptq-nama">${q.nama}</td>
          <td class="ptq-nilai">${q.nilai}</td>
          <td class="ptq-sat">${ikonSat} ${q.satuan}</td>
        </tr>`;
      }
      html += '</table></div>';
    }
  }

  // ── Properti lainnya (dikelompokkan per pset, max 10 per grup) ──
  if (data.properties && data.properties.length > 0) {
    const grupProps = {};
    for (const p of data.properties) {
      const g = p.grup || 'Properti';
      if (!grupProps[g]) grupProps[g] = [];
      grupProps[g].push(p);
    }

    for (const [grup, items] of Object.entries(grupProps)) {
      const tampil = items.slice(0, 12); // batasi agar tidak terlalu panjang
      html += `<div class="prop-grup prop-grup-collapsible">`;
      html += `<div class="prop-grup-judul">${grup} <span class="prop-count">(${items.length})</span></div>`;
      for (const p of tampil) {
        html += `<div class="prop-baris">
          <div class="prop-kunci">${p.nama}</div>
          <div class="prop-nilai">${p.nilai}</div>
        </div>`;
      }
      if (items.length > 12) {
        html += `<div class="prop-lebih">+${items.length - 12} lagi...</div>`;
      }
      html += '</div>';
    }
  }

  document.getElementById('isi-properti').innerHTML = html;
}

// ============================================================
// TAMPILKAN KALKULASI
// ============================================================
function tampilkanKalkulasi(k) {
  const f2 = (n) => (n > 0) ? n.toFixed(2) : null;

  const barisBaris = (area, vol) => {
    const a = f2(area), v = f2(vol);
    if (!a && !v) return '<div class="kalk-nol">—</div>';
    return (a ? `<div class="kalk-row"><span class="kalk-kiri">Luas</span><b>${a}</b><span class="kalk-sat">m²</span></div>` : '')
         + (v ? `<div class="kalk-row"><span class="kalk-kiri">Volume</span><b>${v}</b><span class="kalk-sat">m³</span></div>` : '');
  };

  const tabelLevel = (lv) => `
    <tr>
      <td class="td-nama">${lv.nama}</td>
      <td>${f2(lv.areaDinding) ?? '—'}</td>
      <td>${f2(lv.volDinding)  ?? '—'}</td>
      <td>${f2(lv.areaLantai)  ?? '—'}</td>
      <td>${f2(lv.volLantai)   ?? '—'}</td>
      <td>${lv.pintu   || '—'}</td>
      <td>${lv.jendela || '—'}</td>
    </tr>`;

  const t = k.total;
  const adaLevel = k.levels && k.levels.length > 0;

  const badgeSumber = t.sumberData === 'Geometri 3D'
    ? `<div class="kalk-badge-geom">📐 Estimasi dari geometri 3D — aktifkan <b>Export Quantities</b> di Revit untuk data presisi</div>`
    : `<div class="kalk-badge-ok">✅ Data dari properti IFC</div>`;

  // Total cards
  const totalHtml = `
    <div class="kalk-section-judul">TOTAL BANGUNAN</div>
    <div class="kalk-grid">
      <div class="kalk-kartu">
        <div class="kalk-label">🧱 Dinding</div>
        ${barisBaris(t.areaDinding, t.volDinding)}
      </div>
      <div class="kalk-kartu">
        <div class="kalk-label">⬜ Lantai</div>
        ${barisBaris(t.areaLantai, t.volLantai)}
      </div>
      <div class="kalk-kartu">
        <div class="kalk-label">🔲 Ceiling</div>
        ${barisBaris(t.areaCeiling, t.volCeiling)}
      </div>
      <div class="kalk-kartu kalk-merah">
        <div class="kalk-label">🚪 Pintu</div>
        <div class="kalk-row"><b class="kalk-besar">${t.pintu || '—'}</b><span class="kalk-sat">${t.pintu ? 'unit' : ''}</span></div>
      </div>
      <div class="kalk-kartu kalk-merah">
        <div class="kalk-label">🪟 Jendela</div>
        <div class="kalk-row"><b class="kalk-besar">${t.jendela || '—'}</b><span class="kalk-sat">${t.jendela ? 'unit' : ''}</span></div>
      </div>
    </div>`;

  // Per level tabel
  const levelHtml = adaLevel ? `
    <div class="kalk-section-judul" style="margin-top:10px">PER LEVEL / LANTAI</div>
    <div class="kalk-tabel-wrap">
      <table class="kalk-tabel">
        <thead>
          <tr>
            <th class="td-nama">Level</th>
            <th>Luas<br>Dinding<br><span class="th-sat">m²</span></th>
            <th>Vol<br>Dinding<br><span class="th-sat">m³</span></th>
            <th>Luas<br>Lantai<br><span class="th-sat">m²</span></th>
            <th>Vol<br>Lantai<br><span class="th-sat">m³</span></th>
            <th>Pintu</th>
            <th>Jendela</th>
          </tr>
        </thead>
        <tbody>
          ${k.levels.map(tabelLevel).join('')}
          <tr class="tr-total">
            <td class="td-nama">TOTAL</td>
            <td>${f2(t.areaDinding) ?? '—'}</td>
            <td>${f2(t.volDinding)  ?? '—'}</td>
            <td>${f2(t.areaLantai)  ?? '—'}</td>
            <td>${f2(t.volLantai)   ?? '—'}</td>
            <td>${t.pintu   || '—'}</td>
            <td>${t.jendela || '—'}</td>
          </tr>
        </tbody>
      </table>
    </div>` : '<div class="kalk-badge-warn">⚠️ Tidak ada data level (IfcBuildingStorey) ditemukan</div>';

  document.getElementById('isi-kalkulasi').innerHTML = badgeSumber + totalHtml + levelHtml;
}

// ============================================================
// TAMPILKAN DAFTAR ELEMEN
// ============================================================
function tampilkanDaftarElemen(jenis) {
  const ikon = {
    'IfcWall':'🧱','IfcWallStandardCase':'🧱','IfcSlab':'⬜','IfcBeam':'📏',
    'IfcColumn':'🏛️','IfcDoor':'🚪','IfcWindow':'🪟','IfcRoof':'🏠',
    'IfcStair':'🪜','IfcFurnishingElement':'🪑','IfcFlowSegment':'🔧',
    'IfcMember':'⚙️','IfcPlate':'🟦','IfcSpace':'📐','IfcCovering':'🔲'
  };
  const label = {
    'IfcWall':'Dinding','IfcWallStandardCase':'Dinding (Std)','IfcSlab':'Pelat/Lantai',
    'IfcBeam':'Balok','IfcColumn':'Kolom','IfcDoor':'Pintu','IfcWindow':'Jendela',
    'IfcRoof':'Atap','IfcStair':'Tangga','IfcFurnishingElement':'Furnitur',
    'IfcFlowSegment':'MEP/Pipa','IfcMember':'Rangka','IfcPlate':'Panel',
    'IfcSpace':'Ruangan','IfcCovering':'Penutup'
  };
  const el = document.getElementById('daftar-elemen');
  el.innerHTML = '';
  if (!Object.keys(jenis).length) {
    el.innerHTML = '<div class="kosong-panel">Tidak ada elemen terdeteksi</div>'; return;
  }
  for (const [tipe, jumlah] of Object.entries(jenis)) {
    const item = document.createElement('div');
    item.className = 'item-elemen';
    item.innerHTML = `
      <span class="ikon">${ikon[tipe]||'📦'}</span>
      <span class="nama">${label[tipe]||tipe}</span>
      <span class="jumlah">${jumlah}</span>`;
    el.appendChild(item);
  }
}

// ============================================================
// TAB KANAN
// ============================================================
function bukaTabKanan(tabId) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('aktif', b.dataset.tab === tabId));
  document.querySelectorAll('.tab-konten').forEach(t => t.classList.toggle('aktif', t.id === 'tab-' + tabId));
}

document.querySelectorAll('.tab-btn').forEach(b => {
  b.addEventListener('click', () => bukaTabKanan(b.dataset.tab));
});

// ============================================================
// UI HELPERS
// ============================================================
function tampilkanLoading(v) {
  document.getElementById('layar-loading').style.display = v ? 'flex' : 'none';
}
function setStatus(pesan, muat) {
  document.getElementById('teks-status').textContent = pesan;
  document.getElementById('status-dot').className = 'status-dot' + (muat ? ' muat' : '');
}

// ============================================================
// BUKA FILE
// ============================================================
async function bukaFile() {
  if (!window.elektronAPI) { alert('Jalankan dengan: npm start'); return; }
  tampilkanLoading(true);
  setStatus('Memuat file IFC...', true);
  try {
    const hasil = await window.elektronAPI.bukaFileIFC();
    if (!hasil) { tampilkanLoading(false); setStatus('Dibatalkan', false); return; }
    if (!hasil.meshList.length) throw new Error('Tidak ada geometri dalam file IFC ini.');

    bangunScene(hasil.meshList);
    tampilkanDaftarElemen(hasil.jenisElemen);
    tampilkanKalkulasi(hasil.kalkulasi);

    const total = Object.values(hasil.jenisElemen).reduce((a,b)=>a+b,0);
    document.getElementById('layar-sambutan').style.display = 'none';
    document.getElementById('kanvas-3d').style.display = 'block';
    document.getElementById('info-file').style.display = 'flex';
    document.getElementById('nama-file-aktif').textContent = hasil.nama;
    document.getElementById('jumlah-elemen').textContent = `${total} elemen · ${hasil.meshList.length} mesh`;
    setStatus(`✅ ${hasil.nama}`, false);

  } catch(e) {
    console.error(e);
    setStatus(`Error: ${e.message}`, false);
    alert(`Gagal memuat: ${e.message}`);
  } finally {
    tampilkanLoading(false);
  }
}

document.getElementById('tombol-buka').addEventListener('click', bukaFile);
document.getElementById('tombol-buka-besar').addEventListener('click', bukaFile);

document.getElementById('tombol-reset').addEventListener('click', () => {
  if (modelGrup) {
    const box = new THREE.Box3().setFromObject(modelGrup);
    const c = new THREE.Vector3(); box.getCenter(c);
    targetX = c.x; targetY = c.y; targetZ = c.z;
    const s = new THREE.Vector3(); box.getSize(s);
    jarak = Math.max(s.x, s.y, s.z) * 2;
  }
  rotasiX = 30; rotasiY = 45; perbaruiKamera();
});

document.getElementById('tombol-wireframe').addEventListener('click', () => {
  wireframeMode = !wireframeMode;
  if (modelGrup) modelGrup.traverse(o => { if (o.material) o.material.wireframe = wireframeMode; });
  const btn = document.getElementById('tombol-wireframe');
  btn.textContent = wireframeMode ? '⬡ Solid' : '⬡ Wireframe';
  btn.classList.toggle('aktif', wireframeMode);
});

// ============================================================
// MULAI
// ============================================================
inisialisasiTiga();
setStatus('Siap — Buka file IFC untuk memulai', false);

// Terima update progress dari worker
if (window.elektronAPI?.onLoadingStatus) {
  window.elektronAPI.onLoadingStatus((pesan) => {
    document.querySelector('.teks-loading').textContent = pesan;
    setStatus(pesan, true);
  });
}
