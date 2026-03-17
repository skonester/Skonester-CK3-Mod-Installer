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
    // Used for "Analyzing ZIP..." or "Ready" phases
    ipcRenderer.on('install-status', (event, data) => callback(data));
  },
  onProgressUpdate: (callback) => {
    // Used for the actual MB/s and extraction percentages
    ipcRenderer.on('progress-update', (event, data) => callback(data));
  },

  // 🎨 System Accent Color (Requested securely from Main)
  getSystemAccent: () => ipcRenderer.invoke('get-system-accent'),
  onAccentChange: (callback) => {
    ipcRenderer.on('accent-color-changed', (event, color) => callback(color));
  },

  // 🪟 Window Controls
  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close')
});