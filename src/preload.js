const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('emiApi', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  chooseGameDirectory: () => ipcRenderer.invoke('settings:chooseGameDirectory'),
  chooseMrpack: () => ipcRenderer.invoke('pack:chooseMrpack'),
  getRemoteNews: () => ipcRenderer.invoke('remote:getNews'),
  getRemoteLauncher: () => ipcRenderer.invoke('remote:getLauncher'),
  getRemotePack: () => ipcRenderer.invoke('remote:getPack'),
  openNewsEditor: () => ipcRenderer.invoke('external:openNewsEditor'),
  openExternal: (url) => ipcRenderer.invoke('external:open', url),
  getMicrosoftStatus: () => ipcRenderer.invoke('auth:microsoft:status'),
  loginMicrosoft: () => ipcRenderer.invoke('auth:microsoft:login'),
  logoutMicrosoft: () => ipcRenderer.invoke('auth:microsoft:logout'),
  configureMicrosoftClientId: (clientId) => ipcRenderer.invoke('auth:microsoft:configure', clientId),
  openMicrosoftVerification: (url) => ipcRenderer.invoke('auth:microsoft:openVerification', url),
  onMicrosoftDeviceCode: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('auth:microsoft:deviceCode', listener);
    return () => ipcRenderer.removeListener('auth:microsoft:deviceCode', listener);
  },
  onMinecraftProfile: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('auth:minecraft:profile', listener);
    return () => ipcRenderer.removeListener('auth:minecraft:profile', listener);
  },
  launchGame: () => ipcRenderer.invoke('game:launch'),
  onGameStatus: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('game:status', listener);
    return () => ipcRenderer.removeListener('game:status', listener);
  }
});

window.addEventListener('DOMContentLoaded', () => {
  const script = document.createElement('script');
  script.src = 'functional-v05.js';
  script.defer = true;
  document.head.appendChild(script);
});
