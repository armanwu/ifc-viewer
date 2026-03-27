const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('elektronAPI', {
  bukaFileIFC:    () => ipcRenderer.invoke('buka-dan-parse-ifc'),
  ambilProperti:  (expressId) => ipcRenderer.invoke('ambil-properti', expressId),
  onLoadingStatus:(cb) => ipcRenderer.on('loading-status', (_, pesan) => cb(pesan))
});
