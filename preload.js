const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('app', {
  // 📁 File System & Dialogs
  pickZip: () => ipcRenderer.invoke('pick-zip'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  autoDetectCK3ModsFolder: () => ipcRenderer.invoke('auto-detect-ck3-mods-folder'),
  
  // 🚀 Installation
  install: (data) => ipcRenderer.invoke('install', data),
  
  // 📡 Real-time Updates (Main -> Renderer)
  onInstallStatus: (callback) => {
    // AGENT FIX: Purge existing listeners to prevent memory leaks and duplicate callbacks
    ipcRenderer.removeAllListeners('install-status');
    ipcRenderer.on('install-status', (event, data) => callback(data));
  },
  onProgressUpdate: (callback) => {
    ipcRenderer.removeAllListeners('progress-update');
    ipcRenderer.on('progress-update', (event, data) => callback(data));
  },

  // 🎨 System Accent Color (Requested securely from Main)
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