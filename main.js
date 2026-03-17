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

// ✅ FIXED 'install' handler - Smart flattening only when root folder exists
ipcMain.handle('install', async function(event, data) {
  try {
    var JSZip = require('jszip');
    var zip = new JSZip();
    var zipData = await fs.readFile(data.zipPath);
    await zip.loadAsync(zipData);

    var modNumber = 1;
    var modFolderName;
    while (true) {
      modFolderName = `mod${modNumber}`;
      var targetDir = path.join(data.folderPath, modFolderName);
      try {
        await fs.access(targetDir);
        modNumber++;
      } catch {
        break;
      }
    }

    var modFilename = `${modFolderName}.mod`;
    var modName = data.modName || `Mod ${modNumber}`;
    var modVersion = data.version || '1.18.*';
    var modId = data.modId || '';
    
    var modContent = `name="${modName}"\\n` +
                     `path="mod/${modFolderName}"\\n` +
                     `supported_version="${modVersion}"\\n`;
    
    if (modId) modContent += `remote_file_id="${modId}"\\n`;
    modContent += `version="${modVersion}"\\n` +
                 'tags={"1.18 \\"Crane\\""}';

    await fs.writeFile(path.join(data.folderPath, modFilename), modContent);

    var targetDir = path.join(data.folderPath, modFolderName);
    await fs.mkdir(targetDir, {recursive: true});

    // 🔧 FIXED: Detect if zip has root folder vs flat structure, then extract accordingly
    var files = Object.keys(zip.files);
    var hasRootFolder = files.length > 0 && files.every(filePath => {
      // Check if ALL files are inside a single root folder (common mod zip pattern)
      const firstSlashIndex = filePath.indexOf('/');
      return firstSlashIndex !== -1;
    }) && files.some(filePath => filePath.includes('/'));

    for (var i = 0; i < files.length; i++) {
      var fullZipPath = files[i];
      var zipFile = zip.files[fullZipPath];
      if (zipFile.dir) continue;

      var targetPath;
      if (hasRootFolder) {
        // ✅ FLATTEN: Remove root folder name (e.g., "MyMod/files/..." → "files/...")
        const firstSlashIndex = fullZipPath.indexOf('/');
        targetPath = path.join(targetDir, fullZipPath.substring(firstSlashIndex + 1));
      } else {
        // ✅ PRESERVE: Clean zip with files at root (e.g., "descriptor.mod" → "descriptor.mod")
        targetPath = path.join(targetDir, fullZipPath);
      }

      var content = await zipFile.async('uint8array');
      await fs.mkdir(path.dirname(targetPath), {recursive: true});
      await fs.writeFile(targetPath, content);
    }

    return {
      success: true,
      message: `✅ Created ${modFolderName}/ + ${modFilename}`,
      details: `${modName} (slot ${modNumber})`
    };
  } catch (err) {
    return {success: false, error: err.message};
  }
});
