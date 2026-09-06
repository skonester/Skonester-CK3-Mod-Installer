const { app, BrowserWindow, ipcMain, systemPreferences, dialog, shell } = require('electron');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const os = require('os');
const yauzl = require('yauzl-promise');
const { pipeline } = require('stream/promises');
const { parseClausewitz, serializeClausewitz, inspectZipDescriptor } = require('./clausewitz');

let mainWin;

app.whenReady().then(function() {
  mainWin = new BrowserWindow({
    width: 780,
    height: 980,
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

// 🎨 SECURE ACCENT COLOR HANDLERS
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
    filters: [{name: 'CK3 Mod Archive', extensions: ['zip']}]
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('pick-folder', async function() {
  var result = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return result.filePaths[0] || null;
});

// 🔍 Multi-Platform CK3 mod path discovery (harvested from SquiresWay / Irony)
ipcMain.handle('auto-detect-ck3-mods-folder', async function() {
  try {
    const candidates = [];
    const home = os.homedir();
    const user = os.userInfo ? os.userInfo().username : '';

    if (process.platform === 'win32') {
      candidates.push(
        path.join(home, 'Documents', 'Paradox Interactive', 'Crusader Kings III', 'mod'),
        path.join(home, 'OneDrive', 'Documents', 'Paradox Interactive', 'Crusader Kings III', 'mod'),
        path.join(home, 'OneDrive', 'Dokumente', 'Paradox Interactive', 'Crusader Kings III', 'mod'),
        path.join('C:', 'Users', user, 'Documents', 'Paradox Interactive', 'Crusader Kings III', 'mod')
      );
    } else if (process.platform === 'darwin') {
      candidates.push(
        path.join(home, 'Documents', 'Paradox Interactive', 'Crusader Kings III', 'mod'),
        path.join(home, 'Library', 'Application Support', 'Paradox Interactive', 'Crusader Kings III', 'mod')
      );
    } else {
      // Linux & Steam Deck
      candidates.push(
        path.join(home, '.local', 'share', 'Paradox Interactive', 'Crusader Kings III', 'mod'),
        path.join(home, '.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Paradox Interactive', 'Crusader Kings III', 'mod'),
        path.join(home, '.paradoxinteractive', 'Crusader Kings III', 'mod')
      );
    }

    for (const candidate of candidates) {
      try {
        await fsPromises.access(candidate);
        return candidate;
      } catch {}
    }
    
    return null;
  } catch (err) {
    console.error('Auto-detect failed:', err);
    return null;
  }
});

// 📦 In-memory ZIP inspection for descriptor.mod (harvested from SquiresWay / Irony)
ipcMain.handle('inspect-zip', async function(event, zipPath) {
  try {
    return await inspectZipDescriptor(zipPath);
  } catch (err) {
    console.error('Inspect ZIP failed:', err);
    return { foundDescriptor: false, error: err.message };
  }
});

// Helper: Resolve installed mod target directory supporting absolute paths, relative paths, archives, and stem fallbacks
function resolveModTargetDir(parsed, modFileName, folderPath) {
  const rawPath = parsed?.path || parsed?.archive || null;
  const modStem = modFileName.replace(/\.mod$/i, '');
  let candidate = null;

  if (rawPath && typeof rawPath === 'string') {
    const trimmed = rawPath.trim();
    if (path.isAbsolute(trimmed)) {
      candidate = path.normalize(trimmed);
    } else {
      const cleanRelative = trimmed.replace(/^mod[\\/]/i, '');
      candidate = path.resolve(folderPath, cleanRelative);
    }
  }

  if (candidate) {
    try {
      if (fs.existsSync(candidate)) {
        return { targetDir: candidate, dirExists: true };
      }
    } catch {}
  }

  // Fallback: check if folder with mod stem exists in folderPath
  const fallback = path.resolve(folderPath, modStem);
  try {
    if (fs.existsSync(fallback)) {
      return { targetDir: fallback, dirExists: true };
    }
  } catch {}

  return { targetDir: candidate || fallback, dirExists: false };
}

// 📚 List installed mods from CK3 mod folder
ipcMain.handle('list-installed-mods', async function(event, folderPath) {
  if (!folderPath) return [];
  try {
    const entries = await fsPromises.readdir(folderPath, { withFileTypes: true });
    const modFiles = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.mod'));

    const results = [];
    for (const modFile of modFiles) {
      try {
        const fullModFilePath = path.join(folderPath, modFile.name);
        const content = await fsPromises.readFile(fullModFilePath, 'utf8');
        const parsed = parseClausewitz(content);
        const { targetDir, dirExists } = resolveModTargetDir(parsed, modFile.name, folderPath);

        results.push({
          modFileName: modFile.name,
          fullModPath: fullModFilePath,
          name: parsed.name || modFile.name.replace(/\.mod$/i, ''),
          version: parsed.version || '1.0',
          supportedVersion: parsed.supported_version || '',
          remoteFileId: parsed.remote_file_id || '',
          tags: Array.isArray(parsed.tags) ? parsed.tags : (parsed.tags ? [parsed.tags] : []),
          path: parsed.path || '',
          targetDir,
          dirExists
        });
      } catch (err) {
        console.error('Failed parsing mod file:', modFile.name, err);
      }
    }

    results.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
    return results;
  } catch (err) {
    console.error('Error listing installed mods:', err);
    return [];
  }
});

// 🗑️ Delete / Uninstall an installed mod
ipcMain.handle('delete-mod', async function(event, data) {
  try {
    const { modFileName, folderPath } = data;
    if (!modFileName || !folderPath) throw new Error('Missing modFileName or folderPath');

    const modFilePath = path.join(folderPath, modFileName);
    let targetDir = null;

    try {
      const content = await fsPromises.readFile(modFilePath, 'utf8');
      const parsed = parseClausewitz(content);
      const res = resolveModTargetDir(parsed, modFileName, folderPath);
      targetDir = res.targetDir;
    } catch (e) {
      console.warn('Could not read mod descriptor for deletion target:', e.message);
    }

    // Delete .mod file
    if (fs.existsSync(modFilePath)) {
      await fsPromises.unlink(modFilePath);
    }

    // Delete folder if exists and safely within folderPath or standard mod path
    if (targetDir && fs.existsSync(targetDir)) {
      const resolvedTarget = path.resolve(targetDir);
      const resolvedFolder = path.resolve(folderPath);
      if (resolvedTarget.startsWith(resolvedFolder) && resolvedTarget !== resolvedFolder) {
        try {
          await fsPromises.rm(resolvedTarget, { recursive: true, force: true });
        } catch (e) {
          console.warn('Could not remove mod folder:', resolvedTarget, e.message);
        }
      }
    }

    return { success: true, message: `Uninstalled ${modFileName}` };
  } catch (err) {
    console.error('Failed to delete mod:', err);
    return { success: false, error: err.message };
  }
});

// 📂 Open path in Explorer / OS file manager
ipcMain.handle('open-path-in-folder', async function(event, targetPath) {
  try {
    if (!targetPath) return false;
    const norm = path.normalize(targetPath);
    const err = await shell.openPath(norm);
    if (err) {
      console.warn('shell.openPath error, trying parent folder:', err);
      const parent = path.dirname(norm);
      if (fs.existsSync(parent)) {
        await shell.openPath(parent);
      }
      return false;
    }
    return true;
  } catch (err) {
    console.error('Failed to open path:', err);
    return false;
  }
});

// 🚀 Launch CK3 via Steam (App ID 1158310)
ipcMain.handle('launch-game', async function() {
  try {
    await shell.openExternal('steam://run/1158310');
    return { success: true };
  } catch (err) {
    console.error('Failed to launch game:', err);
    return { success: false, error: err.message };
  }
});

// ⚠️ Conflict / Overlap Detection (harvested from SquiresWay merging & parser)
ipcMain.handle('check-conflicts', async function(event, folderPath) {
  if (!folderPath) return { totalModsScanned: 0, conflicts: [] };
  try {
    const entries = await fsPromises.readdir(folderPath, { withFileTypes: true });
    const modFiles = entries.filter(e => e.isFile() && e.name.toLowerCase().endsWith('.mod'));

    const fileToModsMap = new Map();
    let totalMods = 0;

    for (const mf of modFiles) {
      try {
        const content = await fsPromises.readFile(path.join(folderPath, mf.name), 'utf8');
        const parsed = parseClausewitz(content);
        const { targetDir, dirExists } = resolveModTargetDir(parsed, mf.name, folderPath);
        if (!dirExists || !targetDir) continue;

        const stat = await fsPromises.stat(targetDir).catch(() => null);
        if (!stat || !stat.isDirectory()) continue;

        totalMods++;
        const modName = parsed.name || mf.name;

        async function scanDir(currentDir, relBase = '') {
          const items = await fsPromises.readdir(currentDir, { withFileTypes: true });
          for (const item of items) {
            const relPath = relBase ? `${relBase}/${item.name}` : item.name;
            const fullPath = path.join(currentDir, item.name);

            if (item.isDirectory()) {
              if (item.name === '.git' || item.name === 'node_modules') continue;
              await scanDir(fullPath, relPath);
            } else {
              const lower = item.name.toLowerCase();
              if (
                lower === 'descriptor.mod' ||
                lower === 'metadata.json' ||
                lower.endsWith('.md') ||
                lower.includes('thumb') ||
                lower.includes('license')
              ) {
                continue;
              }
              const normalizedKey = relPath.toLowerCase().replace(/\\/g, '/');
              if (!fileToModsMap.has(normalizedKey)) {
                fileToModsMap.set(normalizedKey, { originalCase: relPath, mods: [] });
              }
              const entry = fileToModsMap.get(normalizedKey);
              if (!entry.mods.includes(modName)) {
                entry.mods.push(modName);
              }
            }
          }
        }

        await scanDir(targetDir);
      } catch (e) {
        console.error('Error scanning mod for conflicts:', mf.name, e);
      }
    }

    const conflicts = [];
    for (const [key, val] of fileToModsMap.entries()) {
      if (val.mods.length > 1) {
        conflicts.push({
          file: val.originalCase,
          mods: val.mods
        });
      }
    }

    conflicts.sort((a, b) => b.mods.length - a.mods.length || a.file.localeCompare(b.file));
    return { totalModsScanned: totalMods, conflicts };
  } catch (err) {
    console.error('Conflict scan error:', err);
    return { totalModsScanned: 0, conflicts: [], error: err.message };
  }
});

// 🎯 YAUZL-PROMISE + PARADOX CLAUSEWITZ SERIALIZATION + REAL-TIME STREAMING
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

    // 🔧 ZIP root detection
    let rootFolderName = null;
    const firstFolders = [...new Set(leafFiles.map(e => e.filename.split('/')[0].trim()).filter(Boolean))];
    
    // Check if the zip already packages files under a single folder
    let stripPrefix = '';
    if (firstFolders.length === 1 && firstFolders[0]) {
      // If all files are inside a top-level directory e.g. "my_mod/common/..."
      rootFolderName = firstFolders[0];
    }

    let modFolderName;
    
    // Phase 1: ZIP root check
    if (rootFolderName) {
      const targetDir = path.join(data.folderPath, rootFolderName);
      try {
        const stat = await fsPromises.stat(targetDir);
        if (stat.isDirectory()) {
          console.log('Root folder already exists, generating unique slot');
        } else {
          modFolderName = rootFolderName;
        }
      } catch {
        modFolderName = rootFolderName;
      }
    }

    // Phase 2: modN increment if needed or sanitize modName
    if (!modFolderName) {
      let candidate = (data.modName || 'mod')
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '_')
        .replace(/_+/g, '_')
        .slice(0, 32);

      if (candidate && candidate !== 'mod') {
        const targetDir = path.join(data.folderPath, candidate);
        const exists = await fsPromises.stat(targetDir).then(() => true).catch(() => false);
        if (!exists) {
          modFolderName = candidate;
        }
      }

      if (!modFolderName) {
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
            break;
          } catch {
            break;
          }
        }
      }
    }

    console.log('🎯 Destination folder:', modFolderName);

    // 📝 Create .mod files using Clausewitz serialization
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
    const modName = data.modName || 'Custom Mod';
    const modVersion = data.version || '1.0';
    const supportedVersion = data.supportedVersion || `${modVersion}.*`;
    const remoteFileId = data.modId ? String(data.modId) : '0';
    const tagsList = Array.isArray(data.tags) && data.tags.length > 0 
      ? data.tags 
      : ['Historical', 'Utilities'];
    
    // External .mod descriptor (placed directly in mod/)
    const externalModData = {
      name: modName,
      path: `mod/${modFolderName}`,
      remote_file_id: remoteFileId,
      version: modVersion,
      supported_version: supportedVersion,
      tags: tagsList
    };
    if (data.picture) externalModData.picture = data.picture;

    await fsPromises.writeFile(
      path.join(data.folderPath, modFilename),
      serializeClausewitz(externalModData),
      'utf8'
    );

    const targetDir = path.join(data.folderPath, modFolderName);
    await fsPromises.mkdir(targetDir, { recursive: true });
    
    // Internal descriptor.mod (placed inside mod folder)
    const internalDescriptorData = {
      name: modName,
      version: modVersion,
      supported_version: supportedVersion,
      tags: tagsList,
      remote_file_id: remoteFileId
    };
    if (data.picture) internalDescriptorData.picture = data.picture;

    await fsPromises.writeFile(
      path.join(targetDir, 'descriptor.mod'),
      serializeClausewitz(internalDescriptorData),
      'utf8'
    );

    mainWin.webContents.send('progress-update', {
      percent: 20,
      size: `${totalSizeMB}MB`,
      speed: '0MB/s',
      eta: 'calculating...',
      files: '0 / ' + totalFiles,
      status: 'extracting',
      message: `Extracting ${totalFiles} files to ${modFolderName}/`
    });

    // Determine if we should strip root folder prefix
    const shouldStripRoot = rootFolderName && entries.every(e => e.filename.startsWith(rootFolderName + '/'));

    // 🔥 REAL-TIME EXTRACTION WITH PROGRESS
    const startTime = Date.now();
    let extractedCount = 0;
    let extractedSize = 0;

    for (const entry of entries) {
      let relativeFilename = entry.filename;
      if (shouldStripRoot) {
        relativeFilename = entry.filename.slice(rootFolderName.length + 1);
      }
      if (!relativeFilename) continue;

      // Prevent zip-slip vulnerability
      const safePath = path.normalize(relativeFilename).replace(/^(\.\.[\/\\])+/, '');
      const targetPath = path.join(targetDir, safePath);

      if (entry.filename.endsWith('/')) {
        await fsPromises.mkdir(targetPath, { recursive: true });
      } else {
        await fsPromises.mkdir(path.dirname(targetPath), { recursive: true });
        
        const readStream = await entry.openReadStream();
        const writeStream = fs.createWriteStream(targetPath);
        
        await pipeline(readStream, writeStream);

        extractedCount++;
        extractedSize += Number(entry.uncompressedSize);

        const elapsed = Date.now() - startTime;
        const percent = Math.round((extractedCount / totalFiles) * 80) + 20; 
        const currentSizeMB = Math.round(extractedSize / 1024 / 1024);
        const avgSpeed = elapsed > 0 ? (currentSizeMB / (elapsed / 1000)).toFixed(1) : '0.0';
        
        const bytesPerMs = elapsed > 0 ? extractedSize / elapsed : 0;
        const remainingBytes = totalSize - extractedSize;
        const etaMs = bytesPerMs > 0 ? remainingBytes / bytesPerMs : 0;

        mainWin.webContents.send('progress-update', {
          percent,
          size: `${currentSizeMB}MB / ${totalSizeMB}MB`,
          speed: `${avgSpeed}MB/s`,
          eta: `${Math.round(etaMs / 1000)}s`,
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
    return { success: false, error: err.message };
  } finally {
    if (zip) await zip.close();
  }
});