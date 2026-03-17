const {app, BrowserWindow, ipcMain, systemPreferences} = require('electron');
const {dialog} = require('electron');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');
const AdmZip = require('adm-zip');

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

// 🎯 ADM-ZIP + REAL-TIME PROGRESS BAR
ipcMain.handle('install', async function(event, data) {
  try {
    console.log('🚀 Install started:', data.zipPath);
    
    // Send "installing" status
    mainWin.webContents.send('install-status', { status: 'detecting', message: 'Analyzing ZIP...' });
    
    const zip = new AdmZip(data.zipPath);
    const zipEntries = zip.getEntries();
    const leafFiles = zipEntries.filter(entry => !entry.isDirectory);
    const totalFiles = leafFiles.length;
    const totalSize = zipEntries.reduce((sum, e) => sum + e.header.uncompressedSize, 0);
    
    console.log(`ZIP: ${totalFiles} files, ${Math.round(totalSize/1024/1024)}MB`);
    mainWin.webContents.send('install-status', { 
      status: 'ready', 
      totalFiles, 
      totalSize: Math.round(totalSize/1024/1024),
      message: `Ready: ${totalFiles} files, ${Math.round(totalSize/1024/1024)}MB` 
    });

    // 🔧 ZIP root detection
    let rootFolderName = null;
    const firstFolders = [...new Set(leafFiles.map(e => e.entryName.split('/')[0].trim()).filter(Boolean))];
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
        const stat = await fs.stat(targetDir);
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
          const stat = await fs.stat(targetDir);
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
    
    const externalModContent = `name="${modName}"
path="mod/${modFolderName}"
remote_file_id="${remoteFileId}"
version="${modVersion}"
tags={ "1.18 \"Crane\"" }`;
    
    await fs.writeFile(path.join(data.folderPath, modFilename), externalModContent);

    const targetDir = path.join(data.folderPath, modFolderName);
    await fs.mkdir(targetDir, {recursive: true});
    
    const descriptorContent = `name="${modName}"
version="${modVersion}"
supported_version="${modVersion}.*"
tags={ "1.18 \"Crane\"" }
remote_file_id="${remoteFileId}"`;
    await fs.writeFile(path.join(targetDir, 'descriptor.mod'), descriptorContent);

    mainWin.webContents.send('progress-update', {
      percent: 20,
      size: `${Math.round(totalSize/1024/1024)}MB`,
      speed: '0MB/s',
      eta: 'calculating...',
      files: '0 / ' + totalFiles,
      status: 'extracting',
      message: `Extracting ${totalFiles} files to ${modFolderName}/`
    });

    // 🔥 SIMULATED REAL-TIME EXTRACTION WITH PROGRESS
    const startTime = Date.now();
    const fakeDelayPerFile = 5;  // ms per file (realistic)
    
    for (let i = 0; i < leafFiles.length; i++) {
      const entry = leafFiles[i];
      const targetPath = path.join(targetDir, entry.entryName);
      await fs.mkdir(path.dirname(targetPath), {recursive: true});
      
      // Write file
      const content = entry.getData();
      await fs.writeFile(targetPath, content);

      // 🎯 PROGRESS UPDATE
      const elapsed = Date.now() - startTime;
      const percent = Math.round((i + 1) / totalFiles * 80) + 20;  // 20-100%
      const currentSize = Math.round((i + 1) / totalFiles * totalSize / 1024 / 1024);
      const avgSpeed = (currentSize * 1024 * 1024 / elapsed * 1000).toFixed(1);
      const remainingFiles = totalFiles - (i + 1);
      const etaMs = remainingFiles * fakeDelayPerFile;
      
      mainWin.webContents.send('progress-update', {
        percent,
        size: `${currentSize}MB / ${Math.round(totalSize/1024/1024)}MB`,
        speed: `${avgSpeed}MB/s`,
        eta: `${Math.round(etaMs/1000)}s`,
        files: `${i + 1} / ${totalFiles}`,
        status: 'extracting',
        message: `Writing ${path.basename(targetPath)}`
      });
      
      // Small delay for smooth animation (remove in prod)
      await new Promise(r => setTimeout(r, fakeDelayPerFile));
    }

    // Final cleanup
    mainWin.webContents.send('progress-update', {
      percent: 100,
      size: `${Math.round(totalSize/1024/1024)}MB / ${Math.round(totalSize/1024/1024)}MB`,
      speed: '100%',
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
  }
});
