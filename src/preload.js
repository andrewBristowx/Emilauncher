const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('emiApi', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  chooseGameDirectory: () => ipcRenderer.invoke('settings:chooseGameDirectory'),
  getRemoteNews: () => ipcRenderer.invoke('remote:getNews'),
  getRemoteLauncher: () => ipcRenderer.invoke('remote:getLauncher'),
  getRemotePack: () => ipcRenderer.invoke('remote:getPack'),
  openNewsEditor: () => ipcRenderer.invoke('external:openNewsEditor'),
  openExternal: (url) => ipcRenderer.invoke('external:open', url)
});
