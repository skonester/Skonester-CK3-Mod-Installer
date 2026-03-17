const {app, BrowserWindow, ipcMain} = require('electron');
const {dialog} = require('electron');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

let mainWin;

app.whenReady().then(function() {
  mainWin = new BrowserWindow({
    width: 600,
    height: 550,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  mainWin.loadFile('index.html');
});

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

// AUTO-DETECT (unchanged)
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

// 🔥 AUTO-INCREMENT MOD INSTALLER (one at a time)
ipcMain.handle('install', async function(event, data) {
  try {
    var JSZip = require('jszip');
    var zip = new JSZip();
    var zipData = await fs.readFile(data.zipPath);
    await zip.loadAsync(zipData);

    // 🌟 FIND NEXT FREE modN folder
    var modNumber = 1;
    var modFolderName;
    while (true) {
      modFolderName = `mod${modNumber}`;
      var targetDir = path.join(data.folderPath, modFolderName);
      try {
        await fs.access(targetDir);
        modNumber++;
      } catch {
        break; // Found empty slot!
      }
    }

    // Create matching .mod file
    var modFilename = `${modFolderName}.mod`;
    var modName = data.modName || `Mod ${modNumber}`;
    var modVersion = data.version || '1.18.*';
    var modId = data.modId || '';
    
    var modContent = `name="${modName}"\n` +
                    `path="mod/${modFolderName}"\n` +
                    `supported_version="${modVersion}"\n`;
    
    if (modId) modContent += `remote_file_id="${modId}"\n`;
    modContent += `version="${modVersion}"\n` +
                 'tags={"1.18 \"Crane\""}';

    await fs.writeFile(path.join(data.folderPath, modFilename), modContent);

    // Extract to new folder
    var targetDir = path.join(data.folderPath, modFolderName);
    await fs.mkdir(targetDir, {recursive: true});

    var files = Object.keys(zip.files);
    for (var i = 0; i < files.length; i++) {
      var fullZipPath = files[i];
      var zipFile = zip.files[fullZipPath];
      if (zipFile.dir) continue;

      var parts = fullZipPath.split('/');
      var cleanPath = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
      var content = await zipFile.async('uint8array');
      var targetPath = path.join(targetDir, cleanPath);
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
