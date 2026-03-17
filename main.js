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
  
  // 🌟 FIXED: Platform-safe accent color (Windows only)
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

// Window controls
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

// ✅ UPDATED 'install' handler - Uses ZIP root folder name, generates both .mod files, matches your exact format
ipcMain.handle('install', async function(event, data) {
  try {
    var JSZip = require('jszip');
    var zip = new JSZip();
    var zipData = await fs.readFile(data.zipPath);
    await zip.loadAsync(zipData);

    // 🔧 IMPROVED: Detect single root folder name from ZIP structure
    var files = Object.keys(zip.files).filter(f => !zip.files[f].dir);
    var rootFolderName = null;
    if (files.length > 0) {
      const firstParts = files.map(f => f.split('/')[0]).filter(Boolean);
      if (firstParts.length && firstParts.every(p => p === firstParts[0])) {
        rootFolderName = firstParts[0];
      }
    }

    // Use ZIP root folder name, or fall back to modN
    var modNumber = 1;
    var modFolderName = rootFolderName;
    while (modFolderName) {
      var targetDir = path.join(data.folderPath, modFolderName);
      try {
        await fs.access(targetDir);
        modFolderName = `mod${modNumber}`;
        modNumber++;
      } catch {
        break;
      }
    }
    if (!modFolderName) modFolderName = `mod${modNumber}`;

    var modFilename = `${modFolderName}.mod`;
    var modName = data.modName || 'My Mod Name';
    var modVersion = data.version || '1.18.4';
    var remoteFileId = data.modId ?? '0';
    
    // ✅ MATCHES YOUR FORMAT: external .mod file exactly as requested
    var externalModContent = `name="${modName}"\n` +
                            `path="mod/${modFolderName}"\n` +
                            `remote_file_id="${remoteFileId}"\n` +
                            `version="${modVersion}"\n` +
                            `tags={ "1.18 \\"Crane\\"" }`;

    await fs.writeFile(path.join(data.folderPath, modFilename), externalModContent);

    // ✅ BONUS: Also create standard descriptor.mod INSIDE mod folder (CK3 launcher expects this)
    var descriptorContent = `name="${modName}"\n` +
                           `version="${modVersion}"\n` +
                           `supported_version="${modVersion}"\n` +
                           `tags={ "1.18 \\"Crane\\"" }\n` +
                           `remote_file_id="${remoteFileId}"`;
    
    var targetDir = path.join(data.folderPath, modFolderName);
    await fs.mkdir(targetDir, {recursive: true});
    await fs.writeFile(path.join(targetDir, 'descriptor.mod'), descriptorContent);

    // 🔧 IMPROVED extraction: flatten root folder if present
    for (var i = 0; i < files.length; i++) {
      var fullZipPath = files[i];
      var zipFile = zip.files[fullZipPath];
      
      var targetPath;
      if (rootFolderName) {
        // FLATTEN: Remove root folder (e.g., "MyMod/files/..." → "files/...")
        const firstSlashIndex = fullZipPath.indexOf('/');
        targetPath = path.join(targetDir, fullZipPath.substring(firstSlashIndex + 1));
      } else {
        // PRESERVE: No root folder
        targetPath = path.join(targetDir, fullZipPath);
      }

      var content = await zipFile.async('uint8array');
      await fs.mkdir(path.dirname(targetPath), {recursive: true});
      await fs.writeFile(targetPath, content);
    }

    return {
      success: true,
      message: `✅ Created ${modFolderName}/ + ${modFilename} + descriptor.mod`,
      details: `${modName} (folder: ${modFolderName})`
    };
  } catch (err) {
    return {success: false, error: err.message};
  }
});
