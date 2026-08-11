const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('emiApi', {
  getState: () => ipcRenderer.invoke('v06:state'),
  saveSettings: (patch) => ipcRenderer.invoke('v06:settings:set', patch),
  chooseGameDirectory: () => ipcRenderer.invoke('v06:chooseDirectory'),
  chooseMrpack: () => ipcRenderer.invoke('v06:chooseMrpack'),
  openGameFolder: () => ipcRenderer.invoke('v06:openFolder'),
  installOrUpdate: () => ipcRenderer.invoke('v06:install'),
  play: () => ipcRenderer.invoke('v06:play'),
  minimize: () => ipcRenderer.invoke('v06:minimize'),
  close: () => ipcRenderer.invoke('v06:close'),
  onStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('v06:status', listener);
    return () => ipcRenderer.removeListener('v06:status', listener);
  }
});
