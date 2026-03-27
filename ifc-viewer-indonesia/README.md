# 🏗️ IFC Viewer Indonesia

Aplikasi desktop sederhana untuk melihat file IFC (Industry Foundation Classes) — format standar BIM (Building Information Modeling).

## Fitur
- ✅ Buka dan render file `.ifc` secara lokal
- ✅ Tampilan 3D interaktif (putar, zoom, geser)
- ✅ Daftar jenis elemen (dinding, kolom, pintu, dll)
- ✅ Tampilkan properti elemen yang dipilih
- ✅ Mode Wireframe
- ✅ UI sepenuhnya dalam Bahasa Indonesia

## Teknologi
| Library | Fungsi |
|---|---|
| [Electron](https://www.electronjs.org/) | Framework aplikasi desktop |
| [Three.js](https://threejs.org/) | Rendering 3D |
| [web-ifc](https://github.com/ThatOpen/engine_web-ifc) | Parsing file IFC |

## Cara Menjalankan

### Prasyarat
- Node.js versi 18 atau lebih baru
- npm

### Langkah

```bash
# 1. Masuk ke folder proyek
cd ifc-viewer-indonesia

# 2. Install dependency
npm install

# 3. Jalankan aplikasi
npm start
```

### Build Installer

```bash
# Windows (.exe installer)
npm run build -- --win

# macOS (.dmg)
npm run build -- --mac

# Linux (.AppImage)
npm run build -- --linux
```

## Kontrol Navigasi 3D
| Aksi | Kontrol |
|---|---|
| Putar model | Klik kiri + seret |
| Geser (pan) | Klik kanan + seret |
| Zoom | Scroll mouse |
| Reset kamera | Tombol "Reset Kamera" |

## Struktur Proyek

```
ifc-viewer-indonesia/
├── main.js        ← Proses utama Electron (buka jendela, akses file)
├── preload.js     ← Jembatan aman IPC
├── index.html     ← Tampilan UI
├── renderer.js    ← Logika 3D + parsing IFC
└── package.json   ← Konfigurasi proyek
```

## Pengembangan Lebih Lanjut

Ide fitur yang bisa ditambahkan:
- [ ] Pilih/highlight elemen dengan klik
- [ ] Filter visibilitas per kategori
- [ ] Export screenshot
- [ ] Panel pohon struktur bangunan (storey, space)
- [ ] Pengukuran jarak antar elemen
- [ ] Pencarian elemen berdasarkan nama/GUID

---
Dibuat dengan ❤️ untuk komunitas BIM Indonesia
