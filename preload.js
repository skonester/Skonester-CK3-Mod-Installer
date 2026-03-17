const {contextBridge, ipcRenderer, systemPreferences} = require('electron');

contextBridge.exposeInMainWorld('app', {
  pickZip: function() { return ipcRenderer.invoke('pick-zip'); },
  pickFolder: function() { return ipcRenderer.invoke('pick-folder'); },
  install: function(data) { return ipcRenderer.invoke('install', data); },
  autoDetectCK3ModsFolder: function() { return ipcRenderer.invoke('auto-detect-ck3-mods-folder'); },
  
  // 🌟 Electron 40 FANCY FEATURES
  getSystemAccent: function() { 
    return new Promise((resolve) => {
      const accent = systemPreferences.getAccentColor();
      resolve(accent);
    });
  },
  minimize: function() { return ipcRenderer.invoke('window-minimize'); },
  maximize: function() { return ipcRenderer.invoke('window-maximize'); },
  close: function() { return ipcRenderer.invoke('window-close'); }
});

// 🌟 Listen for system accent changes (live sync)
systemPreferences.on('accent-color-changed', (event, color) => {
  const root = document.documentElement;
  root.style.setProperty('--accent', color);
  root.style.setProperty('--system-accent', color.replace(/rgb?\(/, 'rgba(').replace(')', ',0.2)') || `${color}20`);
});
