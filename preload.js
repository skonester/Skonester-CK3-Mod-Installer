const {contextBridge, ipcRenderer, systemPreferences} = require('electron');

contextBridge.exposeInMainWorld('app', {
  pickZip: function() { return ipcRenderer.invoke('pick-zip'); },
  pickFolder: function() { return ipcRenderer.invoke('pick-folder'); },
  install: function(data) { return ipcRenderer.invoke('install', data); },
  autoDetectCK3ModsFolder: function() { return ipcRenderer.invoke('auto-detect-ck3-mods-folder'); },
  
  // 🎯 ADDED: Real-time progress bridge
  onProgressUpdate: function(callback) { 
    return ipcRenderer.on('progress-update', (event, data) => callback(data)); 
  },
  
  // 🌟 Electron 40 FANCY FEATURES
  getSystemAccent: function() { 
    return new Promise((resolve) => {
      // Safety check: systemPreferences is technically main-process only.
      // If it fails, fallback to your default --accent color.
      try {
        const accent = systemPreferences.getAccentColor();
        resolve(accent);
      } catch (e) {
        resolve('#ff6b6b'); 
      }
    });
  },
  minimize: function() { return ipcRenderer.invoke('window-minimize'); },
  maximize: function() { return ipcRenderer.invoke('window-maximize'); },
  close: function() { return ipcRenderer.invoke('window-close'); }
});

// 🌟 Listen for system accent changes (live sync)
try {
  if (systemPreferences && systemPreferences.on) {
    systemPreferences.on('accent-color-changed', (event, color) => {
      // Note: DOM manipulation in preload might need to wait for DOMContentLoaded, 
      // but if this fires after load, it works perfectly.
      const root = document.documentElement;
      if (root) {
        root.style.setProperty('--accent', color);
        root.style.setProperty('--system-accent', color.replace(/rgb?\(/, 'rgba(').replace(')', ',0.2)') || `${color}20`);
      }
    });
  }
} catch (e) {
  console.log("System preferences sync unavailable in this context.");
}