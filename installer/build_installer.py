import os
import sys
import subprocess

def build():
    print("=" * 60)
    print("      BUILD AUTOMATION SCRIPT - IFC VIEWER 3D DESKTOP    ")
    print("=" * 60)
    
    # Base paths
    script_dir = os.path.dirname(os.path.abspath(__file__))
    root_dir = os.path.abspath(os.path.join(script_dir, '..'))
    
    os.chdir(root_dir)
    print(f"Working Directory: {root_dir}")
    
    src_dir = os.path.join(root_dir, 'src')
    app_py = os.path.join(src_dir, 'app.py')
    index_html = os.path.join(src_dir, 'index.html')
    icon_ico = os.path.join(root_dir, 'installer', 'icon.ico')
    dist_dir = os.path.join(root_dir, 'dist')
    build_dir = os.path.join(root_dir, 'build')
    
    if not os.path.exists(app_py):
        print(f"[ERROR] Source file not found: {app_py}")
        sys.exit(1)
        
    if not os.path.exists(index_html):
        print(f"[ERROR] Source file not found: {index_html}")
        sys.exit(1)

    print("\n[1/3] Compiling Executable Bundle with PyInstaller...")
    
    # Package full src directory
    add_data_arg = f"{src_dir};src"
    
    cmd = [
        "pyinstaller",
        "--noconfirm",
        "--onedir",
        "--windowed",
        "--name", "IFCViewer",
        "--distpath", dist_dir,
        "--workpath", build_dir,
        "--add-data", add_data_arg,
        "--clean"
    ]
    
    if os.path.exists(icon_ico):
        cmd.extend(["--icon", icon_ico])
        
    cmd.append(app_py)
    
    print(f"Running: {' '.join(cmd)}")
    result = subprocess.run(cmd, shell=True)
    
    if result.returncode != 0:
        print("\n[ERROR] PyInstaller build compilation failed!")
        sys.exit(result.returncode)
        
    output_exe = os.path.join(dist_dir, 'IFCViewer', 'IFCViewer.exe')
    if os.path.exists(output_exe):
        print("\n" + "=" * 60)
        print("[SUCCESS] PyInstaller build completed successfully!")
        print(f"Executable location: {output_exe}")
        print("=" * 60)
    else:
        print("\n[WARNING] Build finished but IFCViewer.exe was not found in dist directory.")

if __name__ == '__main__':
    build()
