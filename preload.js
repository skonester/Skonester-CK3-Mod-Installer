const {contextBridge, ipcRenderer} = require('electron');

contextBridge.exposeInMainWorld('app', {
  pickZip: function() { return ipcRenderer.invoke('pick-zip'); },
  pickFolder: function() { return ipcRenderer.invoke('pick-folder'); },
  install: function(data) { return ipcRenderer.invoke('install', data); },
  autoDetectCK3ModsFolder: function() { return ipcRenderer.invoke('auto-detect-ck3-mods-folder'); }  // 🔥 ADDED
});
