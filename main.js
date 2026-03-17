const {app, BrowserWindow, ipcMain, systemPreferences} = require('electron');
const {dialog} = require('electron');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

let mainWin;

app.whenReady().then(function() {
  mainWin = new BrowserWindow({
    width: 700,
    height: 900,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  
  if (process.platform === 'win32') {
    try {
      const accentColor = systemPreferences.getAccentColor();
      if (accentColor && typeof mainWin.setAccentColor === 'function') {
        mainWin.setAccentColor(accentColor);
      }
    } catch (err) {
      console.log('Accent color not supported:', err.message);
    }
  }
  
  mainWin.loadFile('index.html');
});

ipcMain.handle('window-minimize', () => mainWin.minimize());
ipcMain.handle('window-maximize', () => {
  if (mainWin.isMaximized()) mainWin.unmaximize();
  else mainWin.maximize();
});
ipcMain.handle('window-close', () => mainWin.close());

ipcMain.handle('pick-zip', async function() {
  var result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{name: 'ZIP', extensions: ['zip']}]
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('pick-folder', async function() {
  var result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('auto-detect-ck3-mods-folder', async function() {
  try {
    const documentsPath = path.join(os.homedir(), 'Documents');
    const standardPath = path.join(documentsPath, 'Paradox Interactive', 'Crusader Kings III', 'mod');
    
    if (await fs.access(standardPath).then(() => true).catch(() => false)) {
      return standardPath;
    }
    
    const alternatePaths = [
      path.join(os.homedir(), 'Documents', 'Paradox Interactive', 'Crusader Kings III', 'mod'),
      path.join('C:', 'Users', os.userInfo().username, 'Documents', 'Paradox Interactive', 'Crusader Kings III', 'mod'),
      path.join(os.homedir(), 'Paradox Interactive', 'Crusader Kings III', 'mod')
    ];
    
    for (const altPath of alternatePaths) {
      if (await fs.access(altPath).then(() => true).catch(() => false)) {
        return altPath;
      }
    }
    
    return null;
  } catch (err) {
    console.error('Auto-detect failed:', err);
    return null;
  }
});

// ✅ FIXED: Proper modN incrementing + ZIP root detection
ipcMain.handle('install', async function(event, data) {
  try {
    var JSZip = require('jszip');
    var zip = new JSZip();
    var zipData = await fs.readFile(data.zipPath);
    await zip.loadAsync(zipData);

    // 🔧 ZIP root detection (nested or flat)
    var files = Object.keys(zip.files);
    var leafFiles = files.filter(f => !zip.files[f].dir);
    var rootFolderName = null;
    
    if (leafFiles.length > 0) {
      const firstParts = leafFiles.map(f => f.split('/')[0]).filter(Boolean);
      if (firstParts.length && firstParts.every(p => p === firstParts[0])) {
        rootFolderName = firstParts[0];
      } else if (leafFiles.every(f => f.indexOf('/') === -1)) {
        const modFile = leafFiles.find(f => f.endsWith('.mod')) || leafFiles[0];
        rootFolderName = path.parse(modFile).name;
      }
    }

    // 🎯 FIXED: Two-phase folder selection - ZIP root FIRST, modN fallback SECOND
    var modFolderName;
    
    // Phase 1: Try ZIP root folder name
    if (rootFolderName) {
      var targetDir = path.join(data.folderPath, rootFolderName);
      try {
        await fs.access(targetDir);
        console.log(`ZIP root "${rootFolderName}" exists, using modN fallback`);
      } catch {
        modFolderName = rootFolderName;  // Empty → use it!
      }
    }
    
    // Phase 2: modN incrementing (original logic, bulletproof)
    if (!modFolderName) {
      var modNumber = 1;
      while (true) {
        modFolderName = `mod${modNumber}`;
        var targetDir = path.join(data.folderPath, modFolderName);
        try {
          await fs.access(targetDir);
          modNumber++;
        } catch {
          break;  // Empty slot found
        }
      }
    }

    console.log(`Installing to: ${modFolderName}`);  // DEBUG

    var modFilename = `${modFolderName}.mod`;
    var modName = data.modName || 'My Mod Name';
    var modVersion = data.version || '1.18.4';
    var remoteFileId = data.modId ?? '0';
    
    var externalModContent = `name="${modName}"\n` +
                            `path="mod/${modFolderName}"\n` +
                            `remote_file_id="${remoteFileId}"\n` +
                            `version="${modVersion}"\n` +
                            `tags={ "1.18 \\"Crane\\"" }`;

    await fs.writeFile(path.join(data.folderPath, modFilename), externalModContent);

    var descriptorContent = `name="${modName}"\n` +
                           `version="${modVersion}"\n` +
                           `supported_version="${modVersion}"\n` +
                           `tags={ "1.18 \\"Crane\\"" }\n` +
                           `remote_file_id="${remoteFileId}"`;
    
    var targetDir = path.join(data.folderPath, modFolderName);
    await fs.mkdir(targetDir, {recursive: true});
    await fs.writeFile(path.join(targetDir, 'descriptor.mod'), descriptorContent);

    // Extraction
    for (var i = 0; i < leafFiles.length; i++) {
      var fullZipPath = leafFiles[i];
      var zipFile = zip.files[fullZipPath];
      
      var targetPath;
      if (rootFolderName && fullZipPath.startsWith(rootFolderName + '/')) {
        targetPath = path.join(targetDir, fullZipPath.substring(rootFolderName.length + 1));
      } else {
        targetPath = path.join(targetDir, fullZipPath);
      }

      var content = await zipFile.async('uint8array');
      await fs.mkdir(path.dirname(targetPath), {recursive: true});
      await fs.writeFile(targetPath, content);
    }

    return {
      success: true,
      message: `✅ Created ${modFolderName}/ + ${modFilename} + descriptor.mod`,
      details: `${modName} (slot: ${modFolderName})`
    };
  } catch (err) {
    return {success: false, error: err.message};
  }
});
