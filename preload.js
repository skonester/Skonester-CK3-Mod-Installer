const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  // 📁 File System & Dialogs
  pickZip: () => ipcRenderer.invoke('pick-zip'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  autoDetectCK3ModsFolder: () => ipcRenderer.invoke('auto-detect-ck3-mods-folder'),
  
  // 📦 Inspection & Harvesting
  inspectZip: (zipPath) => ipcRenderer.invoke('inspect-zip', zipPath),
  
  // 🚀 Installation
  install: (data) => ipcRenderer.invoke('install', data),
  
  // 📚 Mod Loader & Management
  listInstalledMods: (folderPath) => ipcRenderer.invoke('list-installed-mods', folderPath),
  deleteMod: (data) => ipcRenderer.invoke('delete-mod', data),
  openPath: (targetPath) => ipcRenderer.invoke('open-path-in-folder', targetPath),
  launchGame: () => ipcRenderer.invoke('launch-game'),
  checkConflicts: (folderPath) => ipcRenderer.invoke('check-conflicts', folderPath),
  
  // 📡 Real-time Updates (Main -> Renderer)
  onInstallStatus: (callback) => {
    ipcRenderer.removeAllListeners('install-status');
    ipcRenderer.on('install-status', (event, data) => callback(data));
  },
  onProgressUpdate: (callback) => {
    ipcRenderer.removeAllListeners('progress-update');
    ipcRenderer.on('progress-update', (event, data) => callback(data));
  },

  // 🎨 System Accent Color
  getSystemAccent: () => ipcRenderer.invoke('get-system-accent'),
  onAccentChange: (callback) => {
    ipcRenderer.removeAllListeners('accent-color-changed');
    ipcRenderer.on('accent-color-changed', (event, color) => callback(color));
  },

  // 🪟 Window Controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close')
});