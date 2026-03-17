const { app, BrowserWindow, ipcMain, systemPreferences, dialog } = require('electron');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const os = require('os');
const yauzl = require('yauzl-promise');
const { pipeline } = require('stream/promises');

let mainWin;

app.whenReady().then(function() {
  mainWin = new BrowserWindow({
    width: 700,
    height: 950,  // +50px for progress bar
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

// 🎨 SECURE ACCENT COLOR HANDLERS (Added for Preload compatibility)
ipcMain.handle('get-system-accent', () => {
  if (process.platform === 'win32' || process.platform === 'darwin') {
    try {
      return systemPreferences.getAccentColor();
    } catch (e) {
      return null;
    }
  }
  return null;
});

if (process.platform === 'win32' || process.platform === 'darwin') {
  systemPreferences.on('accent-color-changed', (event, newColor) => {
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.webContents.send('accent-color-changed', newColor);
    }
  });
}

ipcMain.handle('pick-zip', async function() {
  var result = await dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{name: 'ZIP', extensions: ['zip', 'rar', '7z']}]
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
    
    if (await fsPromises.access(standardPath).then(() => true).catch(() => false)) {
      return standardPath;
    }
    
    const alternatePaths = [
      path.join(os.homedir(), 'Documents', 'Paradox Interactive', 'Crusader Kings III', 'mod'),
      path.join('C:', 'Users', os.userInfo().username, 'Documents', 'Paradox Interactive', 'Crusader Kings III', 'mod'),
      path.join(os.homedir(), 'Paradox Interactive', 'Crusader Kings III', 'mod')
    ];
    
    for (const altPath of alternatePaths) {
      if (await fsPromises.access(altPath).then(() => true).catch(() => false)) {
        return altPath;
      }
    }
    
    return null;
  } catch (err) {
    console.error('Auto-detect failed:', err);
    return null;
  }
});

// 🎯 YAUZL-PROMISE + REAL-TIME STREAMING PROGRESS
ipcMain.handle('install', async function(event, data) {
  let zip;
  try {
    console.log('🚀 Install started:', data.zipPath);
    mainWin.webContents.send('install-status', { status: 'detecting', message: 'Analyzing ZIP...' });

    // 1. Open ZIP using yauzl
    zip = await yauzl.open(data.zipPath, { supportMacArchive: true });
    
    // Get all entries for metadata and filtering
    const entries = await zip.readEntries();
    const leafFiles = entries.filter(e => !e.filename.endsWith('/'));
    const totalFiles = leafFiles.length;
    const totalSize = leafFiles.reduce((sum, e) => sum + Number(e.uncompressedSize), 0);
    const totalSizeMB = Math.round(totalSize / 1024 / 1024);

    console.log(`ZIP: ${totalFiles} files, ${totalSizeMB}MB`);
    mainWin.webContents.send('install-status', { 
      status: 'ready', 
      totalFiles, 
      totalSize: totalSizeMB,
      message: `Ready: ${totalFiles} files, ${totalSizeMB}MB` 
    });

    // 🔧 ZIP root detection (Phase 1)
    let rootFolderName = null;
    const firstFolders = [...new Set(leafFiles.map(e => e.filename.split('/')[0].trim()).filter(Boolean))];
    console.log('First folders:', firstFolders);
    
    if (firstFolders.length === 1 && firstFolders[0]) {
      rootFolderName = firstFolders[0];
      console.log('DETECTED root:', rootFolderName);
    }

    let modFolderName;
    
    // Phase 1: ZIP root check
    if (rootFolderName) {
      const targetDir = path.join(data.folderPath, rootFolderName);
      console.log('Phase 1 checking:', targetDir);
      try {
        const stat = await fsPromises.stat(targetDir);
        if (stat.isDirectory()) {
          console.log('❌ Root exists, fallback modN');
        } else {
          modFolderName = rootFolderName;
          console.log('✅ Root empty, using:', rootFolderName);
        }
      } catch {
        modFolderName = rootFolderName;
        console.log('✅ Root missing, using:', rootFolderName);
      }
    }

    // Phase 2: modN increment
    if (!modFolderName) {
      console.log('Phase 2: modN scan...');
      let modNumber = 1;
      while (true) {
        modFolderName = `mod${modNumber}`;
        const targetDir = path.join(data.folderPath, modFolderName);
        try {
          const stat = await fsPromises.stat(targetDir);
          if (stat.isDirectory()) {
            modNumber++;
            continue;
          }
          throw new Error('Not dir');
        } catch {
          console.log(`✅ mod${modNumber} ready`);
          break;
        }
      }
    }

    console.log('🎯 FINAL:', modFolderName);

    // 📝 Create .mod files FIRST
    mainWin.webContents.send('progress-update', {
      percent: 10,
      size: '0MB',
      speed: '0MB/s',
      eta: '0s',
      files: '0 / ' + totalFiles,
      status: 'preparing',
      message: `Creating ${modFolderName}.mod + descriptor.mod`
    });

    const modFilename = `${modFolderName}.mod`;
    const modName = data.modName || 'My Mod Name';
    const modVersion = data.version || '1.18.4';
    const remoteFileId = data.modId ?? '0';
    
    const externalModContent = `name="${modName}"\npath="mod/${modFolderName}"\nremote_file_id="${remoteFileId}"\nversion="${modVersion}"\ntags={ "1.18 \\"Crane\\"" }`;
    await fsPromises.writeFile(path.join(data.folderPath, modFilename), externalModContent);

    const targetDir = path.join(data.folderPath, modFolderName);
    await fsPromises.mkdir(targetDir, {recursive: true});
    
    const descriptorContent = `name="${modName}"\nversion="${modVersion}"\nsupported_version="${modVersion}.*"\ntags={ "1.18 \\"Crane\\"" }\nremote_file_id="${remoteFileId}"`;
    await fsPromises.writeFile(path.join(targetDir, 'descriptor.mod'), descriptorContent);

    mainWin.webContents.send('progress-update', {
      percent: 20,
      size: `${totalSizeMB}MB`,
      speed: '0MB/s',
      eta: 'calculating...',
      files: '0 / ' + totalFiles,
      status: 'extracting',
      message: `Extracting ${totalFiles} files to ${modFolderName}/`
    });

    // 🔥 REAL-TIME EXTRACTION WITH PROGRESS
    const startTime = Date.now();
    let extractedCount = 0;
    let extractedSize = 0;

    for (const entry of entries) {
      const targetPath = path.join(targetDir, entry.filename);

      if (entry.filename.endsWith('/')) {
        await fsPromises.mkdir(targetPath, { recursive: true });
      } else {
        await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
        
        const readStream = await entry.openReadStream();
        const writeStream = fs.createWriteStream(targetPath);
        
        await pipeline(readStream, writeStream);

        extractedCount++;
        extractedSize += Number(entry.uncompressedSize);

        // 🎯 REAL PROGRESS UPDATE
        const elapsed = Date.now() - startTime;
        // Map extraction progress (0-100%) to the 20-100% UI progress window
        const percent = Math.round((extractedCount / totalFiles) * 80) + 20; 
        const currentSizeMB = Math.round(extractedSize / 1024 / 1024);
        
        // Prevent Infinity/NaN on immediate files
        const avgSpeed = elapsed > 0 ? (currentSizeMB / (elapsed / 1000)).toFixed(1) : '0.0';
        
        const bytesPerMs = elapsed > 0 ? extractedSize / elapsed : 0;
        const remainingBytes = totalSize - extractedSize;
        const etaMs = bytesPerMs > 0 ? remainingBytes / bytesPerMs : 0;

        mainWin.webContents.send('progress-update', {
          percent,
          size: `${currentSizeMB}MB / ${totalSizeMB}MB`,
          speed: `${avgSpeed}MB/s`,
          eta: `${Math.round(etaMs/1000)}s`,
          files: `${extractedCount} / ${totalFiles}`,
          status: 'extracting',
          message: `Writing ${path.basename(targetPath)}`
        });
      }
    }

    // Final cleanup
    mainWin.webContents.send('progress-update', {
      percent: 100,
      size: `${totalSizeMB}MB / ${totalSizeMB}MB`,
      speed: 'Done',
      eta: '0s',
      files: `${totalFiles} / ${totalFiles}`,
      status: 'complete',
      message: `✅ ${modFolderName}/ ready!`
    });

    return {
      success: true,
      message: `🎉 ${modFolderName}/ + ${totalFiles} files extracted`,
      details: `${modName} v${modVersion} → ${modFolderName}`
    };

  } catch (err) {
    mainWin.webContents.send('progress-update', {
      percent: 0,
      status: 'error',
      message: `❌ ${err.message}`
    });
    console.error('Install failed:', err);
    return {success: false, error: err.message};
  } finally {
    if (zip) await zip.close();
  }
});