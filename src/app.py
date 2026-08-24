import os
import sys
import json
import base64
import threading
import socketserver
import http.server
import webview

def get_resource_dir():
    """
    Get directory containing index.html, works for dev and PyInstaller.
    """
    if hasattr(sys, '_MEIPASS'):
        return os.path.join(sys._MEIPASS, 'src') if os.path.exists(os.path.join(sys._MEIPASS, 'src')) else sys._MEIPASS
    base_dir = os.path.dirname(os.path.abspath(__file__))
    if os.path.exists(os.path.join(base_dir, 'index.html')):
        return base_dir
    root_src = os.path.abspath(os.path.join(base_dir, '..', 'src'))
    if os.path.exists(root_src):
        return root_src
    return base_dir

def find_free_port():
    """Finds an open localhost port."""
    with socketserver.TCPServer(("127.0.0.1", 0), None) as s:
        return s.socket.getsockname()[1]

def start_server(serve_dir, port):
    """Starts local HTTP server daemon."""
    class QuietHandler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=serve_dir, **kwargs)
        def log_message(self, format, *args):
            pass

    handler = QuietHandler
    httpd = socketserver.TCPServer(("127.0.0.1", port), handler)
    httpd.serve_forever()

class Api:
    def __init__(self):
        self._window = None

    def set_window(self, window):
        self._window = window

    def get_app_info(self):
        """Returns application metadata."""
        return {
            "name": "IFC Viewer",
            "version": "1.0.0",
            "author": "Arman Arisman",
            "license": "MIT License",
            "copyright": "Copyright (c) 2026 Arman Arisman",
            "platform": sys.platform
        }

    def open_file_dialog(self):
        """
        Triggers native Windows File Open dialog for .ifc files
        and returns file metadata + base64 content to JavaScript.
        """
        if not self._window:
            return {"error": "Window is not ready"}
        
        try:
            file_types = ('IFC Files (*.ifc)', 'All Files (*.*)')
            result = self._window.create_file_dialog(
                webview.OPEN_DIALOG, 
                allow_multiple=False,
                file_types=file_types
            )
            
            if result and len(result) > 0:
                file_path = result[0]
                return self.read_ifc_file(file_path)
            return None
        except Exception as e:
            return {"error": f"Failed to open file dialog: {str(e)}"}

    def read_ifc_file(self, file_path):
        """
        Reads an IFC file from the given file path and returns base64 content.
        """
        if not file_path or not os.path.exists(file_path):
            return {"error": "File not found"}
        
        try:
            filename = os.path.basename(file_path)
            file_size = os.path.getsize(file_path)
            
            with open(file_path, 'rb') as f:
                content_bytes = f.read()
                
            content_b64 = base64.b64encode(content_bytes).decode('ascii')
            
            return {
                "success": True,
                "filename": filename,
                "filepath": file_path,
                "size_bytes": file_size,
                "size_formatted": self._format_size(file_size),
                "content_b64": content_b64
            }
        except Exception as e:
            return {"error": f"Failed to read file: {str(e)}"}

    def _format_size(self, size_bytes):
        if size_bytes < 1024:
            return f"{size_bytes} B"
        elif size_bytes < 1024 * 1024:
            return f"{size_bytes / 1024:.1f} KB"
        else:
            return f"{size_bytes / (1024 * 1024):.2f} MB"

def main():
    api = Api()
    serve_dir = get_resource_dir()
    port = find_free_port()
    
    # Start local HTTP server daemon thread
    server_thread = threading.Thread(target=start_server, args=(serve_dir, port), daemon=True)
    server_thread.start()
    
    app_url = f"http://127.0.0.1:{port}/index.html"
    print(f"[IFC Viewer] Local HTTP Server active at: {app_url}")
    print(f"[IFC Viewer] Serving directory: {serve_dir}")
    print(f"[IFC Viewer] Copyright (c) 2026 Arman Arisman - MIT License")
    
    window = webview.create_window(
        title="IFC Viewer - 3D Desktop Edition",
        url=app_url,
        js_api=api,
        width=1280,
        height=800,
        min_size=(960, 600),
        background_color='#F8FAFC',
        resizable=True
    )
    api.set_window(window)
    webview.start(debug=True)

if __name__ == '__main__':
    main()
