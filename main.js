const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const fs = require('fs');
const fsPromises = require('fs').promises;
const path = require('path');
const os = require('os');
const { parseClausewitz, inspectZipDescriptor } = require('./clausewitz');
const { prepareHeroicCK3 } = require('./heroic');
const { installMod } = require('./install-mod');

let mainWin;

app.whenReady().then(function() {
  mainWin = new BrowserWindow({
    width: 1150,
    height: 790,
    minWidth: 640,
    minHeight: 520,
    frame: false,
    backgroundColor: '#f8f5f1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  
  mainWin.loadFile(path.join(__dirname, 'index.html'));
});

ipcMain.handle('window-minimize', () => mainWin.minimize());
ipcMain.handle('window-maximize', () => {
  if (mainWin.isMaximized()) mainWin.unmaximize();
  else mainWin.maximize();
});
ipcMain.handle('window-close', () => mainWin.close());

ipcMain.handle('pick-zip', async function() {
  const result = await dialog.showOpenDialog(mainWin, {
    properties: ['openFile'],
    filters: [{name: 'CK3 Mod Archive', extensions: ['zip']}]
  });
  return result.filePaths[0] || null;
});

ipcMain.handle('pick-folder', async function() {
  const result = await dialog.showOpenDialog(mainWin, {
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
        path.join(app.getPath('documents'), 'Paradox Interactive', 'Crusader Kings III', 'mod'),
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

let heroicLaunchInProgress = false;
ipcMain.handle('launch-heroic-ck3', async function(event) {
  if (heroicLaunchInProgress) return { success: false, error: 'CK3 discovery is already running.' };
  heroicLaunchInProgress = true;
  try {
    const { url, executable } = await prepareHeroicCK3({
      onProgress: ({ drive, directories, targetName }) => {
        if (!event.sender.isDestroyed()) {
          event.sender.send('heroic-scan-progress', { drive, directories, targetName });
        }
      }
    });
    await shell.openExternal(url);
    return { success: true, executable };
  } catch (err) {
    console.error('Failed to launch CK3 via Heroic:', err);
    return { success: false, error: err.message };
  } finally {
    heroicLaunchInProgress = false;
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

ipcMain.handle('install', async function(event, data) {
  const sendProgress = progress => {
    if (!event.sender.isDestroyed()) event.sender.send('progress-update', progress);
  };
  try {
    return await installMod(data, sendProgress);
  } catch (error) {
    sendProgress({ percent: 0, message: 'Installation stopped.' });
    console.error('Install failed:', error);
    return { success: false, error: error.message };
  }
});
