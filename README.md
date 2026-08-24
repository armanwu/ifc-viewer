# 🏢 IFC VIEWER

A simple, fast, and modern **3D Desktop Viewer** for opening and inspecting **IFC / BIM 3D models** on Windows. 

Built with **Python** and **Three.js** using an offline **WebAssembly CAD engine**. Designed with a clean Light Mode theme.

---

## ⚡ Quick Start (How to Use)

### 1. Instant 1-Click Install (`install.bat`)
- Double-click **`install.bat`**.
- It automatically builds the application, places it on your system, and creates **Desktop & Start Menu shortcuts**.

### 2. Run Directly for Development (`run_dev.bat`)
- Double-click **`run_dev.bat`** to open the 3D viewer window immediately without installing.

### 3. Uninstall Cleanly (`uninstall.bat`)
- Double-click **`uninstall.bat`** to completely remove the application and shortcuts from your PC.

---

## ✨ Features at a Glance

- **Drag & Drop**: Simply drop any `.ifc` file onto the window to display the 3D model.
- **Detailed Property Inspector**: Click on any wall, column, slab, door, or window to view its complete BIM specifications (Express ID, Type, Name, Dimensions, Volume, Surface Area, and Coordinates).
- **Camera Tools**: View presets (*ISO, Top, Front, Right*), Fit Camera, and Wireframe toggle.
- **100% Offline & Fast**: No internet required after setup.

---

## 📁 File Structure

```
ifc-viewer/
├── install.bat            # ⚙️ 1-Click installer & builder script
├── uninstall.bat          # 🗑️ Clean uninstaller script
├── run_dev.bat            # 🚀 Instant 3D viewer launcher
├── README.md              # 📖 User guide
├── LICENSE                # 📜 MIT License file
├── src/
│   ├── app.py             # Python Desktop runner & file dialog
│   ├── index.html         # 3D Light Mode user interface
│   └── lib/               # Offline WebAssembly 3D engine binaries
└── installer/
    ├── build_installer.py # Build automation script
    └── icon.ico           # Application icon
```

---

## 📄 License & Copyright

Copyright &copy; 2026 **Arman Arisman**.

Licensed under the **[MIT License](LICENSE)**. Free to use, modify, and distribute.
