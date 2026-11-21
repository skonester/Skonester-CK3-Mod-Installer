const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('app', {
  pickZip: () => ipcRenderer.invoke('pick-zip'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  getDroppedFilePath: file => webUtils.getPathForFile(file),
  autoDetectCK3ModsFolder: () => ipcRenderer.invoke('auto-detect-ck3-mods-folder'),
  inspectZip: zipPath => ipcRenderer.invoke('inspect-zip', zipPath),
  install: data => ipcRenderer.invoke('install', data),
  listInstalledMods: folderPath => ipcRenderer.invoke('list-installed-mods', folderPath),
  deleteMod: data => ipcRenderer.invoke('delete-mod', data),
  openPath: targetPath => ipcRenderer.invoke('open-path-in-folder', targetPath),
  launchGame: () => ipcRenderer.invoke('launch-game'),
  launchHeroicCK3: () => ipcRenderer.invoke('launch-heroic-ck3'),
  checkConflicts: folderPath => ipcRenderer.invoke('check-conflicts', folderPath),

  onHeroicScanProgress: callback => {
    ipcRenderer.on('heroic-scan-progress', (_event, data) => callback(data));
  },
  onProgressUpdate: callback => {
    ipcRenderer.on('progress-update', (_event, data) => callback(data));
  },

  minimize: () => ipcRenderer.invoke('window-minimize'),
  maximize: () => ipcRenderer.invoke('window-maximize'),
  close: () => ipcRenderer.invoke('window-close')
});
