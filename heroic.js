const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const GAME_TITLE = 'Crusader Kings III';
const CK3_TITLE = /^(?:crusader\s+kings\s+(?:iii|3)|ck3)$/i;
const HEROIC_PLATFORMS = { win32: 'Windows', linux: 'linux', darwin: 'Mac' };

function gameRelativePath(platform) {
  if (platform === 'darwin') return path.join('binaries', 'ck3.app', 'Contents', 'MacOS', 'ck3');
  return path.join('binaries', platform === 'win32' ? 'ck3.exe' : 'ck3');
}

function targetName(platform) {
  return platform === 'win32' ? 'ck3.exe' : platform === 'darwin' ? 'ck3.app' : 'ck3';
}

function heroicConfigDirs(platform = process.platform, home = os.homedir(), env = process.env) {
  if (platform === 'win32') {
    return [path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'heroic')];
  }
  if (platform === 'darwin') {
    return [path.join(home, 'Library', 'Application Support', 'heroic')];
  }
  return [
    path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'heroic'),
    path.join(home, '.var', 'app', 'com.heroicgameslauncher.hgl', 'config', 'heroic')
  ];
}

function driveRoots(platform = process.platform, home = os.homedir()) {
  if (platform === 'win32') {
    const roots = [];
    for (let code = 65; code <= 90; code++) {
      const root = `${String.fromCharCode(code)}:\\`;
      if (fs.existsSync(root)) roots.push(root);
    }
    return roots;
  }
  const roots = platform === 'darwin'
    ? [home, '/Applications', '/Volumes', '/']
    : [home, '/mnt', '/media', '/run/media', '/'];
  return roots.filter(root => fs.existsSync(root));
}

async function isFile(file) {
  try {
    return (await fs.promises.stat(file)).isFile();
  } catch {
    return false;
  }
}

function knownCK3Paths(root, platform) {
  const folders = platform === 'win32' ? [
    path.join('SteamLibrary', 'steamapps', 'common'),
    path.join('Steam', 'steamapps', 'common'),
    path.join('Program Files (x86)', 'Steam', 'steamapps', 'common'),
    path.join('Program Files', 'Steam', 'steamapps', 'common'),
    'Games', 'XboxGames', ''
  ] : platform === 'darwin' ? [
    path.join('Library', 'Application Support', 'Steam', 'steamapps', 'common'),
    path.join('SteamLibrary', 'steamapps', 'common'),
    path.join('Steam', 'steamapps', 'common'),
    'Games', ''
  ] : [
    path.join('.local', 'share', 'Steam', 'steamapps', 'common'),
    path.join('.steam', 'steam', 'steamapps', 'common'),
    path.join('.var', 'app', 'com.valvesoftware.Steam', '.local', 'share', 'Steam', 'steamapps', 'common'),
    path.join('SteamLibrary', 'steamapps', 'common'),
    path.join('Steam', 'steamapps', 'common'),
    'Games', ''
  ];
  return folders.flatMap(folder => {
    const game = path.join(root, folder, GAME_TITLE);
    const paths = [path.join(game, gameRelativePath(platform))];
    if (platform === 'win32') paths.push(path.join(game, 'ck3.exe'));
    return paths;
  });
}

function matchesCK3Path(file, platform) {
  const parts = path.normalize(file).split(path.sep);
  if (platform === 'darwin') {
    return parts.slice(-4).join('/').toLowerCase() === 'ck3.app/contents/macos/ck3';
  }
  if (platform === 'linux') {
    return parts.at(-1) === 'ck3' && parts.at(-2) === 'binaries';
  }
  return parts.at(-1)?.toLowerCase() === 'ck3.exe';
}

async function scanForCK3(roots = driveRoots(), onProgress = () => {}, platform = process.platform) {
  for (const root of roots) {
    for (const candidate of knownCK3Paths(root, platform)) {
      if (await isFile(candidate)) return candidate;
    }
  }

  let directories = 0;
  for (const root of roots) {
    const stack = [root];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        continue;
      }
      directories++;
      if (directories === 1 || directories % 250 === 0) {
        onProgress({ drive: root, directories, targetName: targetName(platform) });
      }
      for (const entry of entries) {
        const candidate = path.join(dir, entry.name);
        if (entry.isFile() && matchesCK3Path(candidate, platform)) {
          return candidate;
        }
      }
      const subdirs = [];
      for (const entry of entries) {
        // Avoid junction and symlink cycles while traversing entire drives.
        const virtualLinuxDirectory = platform === 'linux' && dir === '/' &&
          /^(?:proc|sys|dev|run)$/i.test(entry.name);
        if (entry.isDirectory() && !entry.isSymbolicLink() && !virtualLinuxDirectory) {
          subdirs.push(entry.name);
        }
      }
      // LIFO stack: visit likely game locations before system directories.
      const priority = name => /^(games?|steamlibrary|steam|users|xboxgames|program files(?: \(x86\))?)$/i.test(name) ? 1 : 0;
      subdirs.sort((a, b) => priority(a) - priority(b));
      for (const name of subdirs) stack.push(path.join(dir, name));
    }
  }
  throw new Error(`Could not find ${targetName(platform)} on any accessible drive.`);
}

function libraryPath(configDir) {
  return path.join(configDir, 'sideload_apps', 'library.json');
}

function readLibrary(configDir) {
  const file = libraryPath(configDir);
  if (!fs.existsSync(file)) return { games: [] };
  let library;
  try {
    library = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    throw new Error(`Heroic's Added Games library could not be read: ${error.message}`);
  }
  if (!library || !Array.isArray(library.games)) {
    throw new Error("Heroic's Added Games library has an unexpected format.");
  }
  return library;
}

function isCK3Entry(game) {
  const title = typeof game?.title === 'string' ? game.title.trim() : '';
  const executable = game?.install?.executable;
  const exe = typeof executable === 'string' ? path.win32.basename(executable) : '';
  return game?.runner === 'sideload' && (CK3_TITLE.test(title) || /^ck3(?:\.exe)?$/i.test(exe));
}

function chooseConfigDir(configDirs) {
  return configDirs.find(dir => fs.existsSync(libraryPath(dir))) ||
    configDirs.find(dir => fs.existsSync(dir)) || configDirs[0];
}

async function saveLibrary(configDir, library) {
  const file = libraryPath(configDir);
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  if (fs.existsSync(file)) {
    const backup = `${file}.ck3-installer-backup`;
    if (!fs.existsSync(backup)) await fs.promises.copyFile(file, backup);
  }
  const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
  try {
    await fs.promises.writeFile(temporary, JSON.stringify(library, null, 2), { flag: 'wx' });
    await fs.promises.rename(temporary, file);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

async function ensureHeroicEntry(configDir, executable, platform = process.platform) {
  const heroicPlatform = HEROIC_PLATFORMS[platform];
  if (!heroicPlatform) throw new Error(`Unsupported operating system: ${platform}`);
  const library = readLibrary(configDir);
  const normalized = platform === 'win32' ? path.resolve(executable).toLowerCase() : path.resolve(executable);
  const existing = library.games.find(game =>
    isCK3Entry(game) && typeof game.app_name === 'string' &&
    typeof game.install?.executable === 'string' &&
    game.install.platform === heroicPlatform &&
    (platform === 'win32' ? path.resolve(game.install.executable).toLowerCase() : path.resolve(game.install.executable)) === normalized
  );
  if (existing) return existing.app_name;

  const managed = library.games.find(game =>
    typeof game?.app_name === 'string' && game.app_name.startsWith('skonester-ck3-')
  );
  const appName = managed?.app_name ||
    `skonester-ck3-${crypto.createHash('sha256').update(normalized).digest('hex').slice(0, 16)}`;
  const entry = {
    runner: 'sideload',
    app_name: appName,
    title: GAME_TITLE,
    install: { executable, platform: heroicPlatform, is_dlc: false },
    // Heroic uses the .app bundle's parent as folder_name when added through its UI.
    folder_name: platform === 'darwin'
      ? path.dirname(path.dirname(path.dirname(path.dirname(executable))))
      : path.dirname(executable),
    art_cover: '',
    art_square: '',
    is_installed: true,
    canRunOffline: true
  };
  if (managed) Object.assign(managed, entry);
  else library.games.push(entry);
  await saveLibrary(configDir, library);
  return appName;
}

function heroicLaunchUrl(appName) {
  const url = new URL('heroic://launch');
  url.searchParams.set('appName', appName);
  url.searchParams.set('runner', 'sideload');
  return url.toString();
}

async function prepareHeroicCK3({ platform = process.platform, configDirs = heroicConfigDirs(platform), roots = driveRoots(platform), onProgress = () => {} } = {}) {
  if (!HEROIC_PLATFORMS[platform]) throw new Error(`Unsupported operating system: ${platform}`);
  const configDir = chooseConfigDir(configDirs);
  if (!configDir) throw new Error('Heroic configuration directory is unavailable.');
  const library = readLibrary(configDir);
  for (const existing of library.games) {
    if (!isCK3Entry(existing) || existing.is_installed === false ||
        typeof existing.app_name !== 'string' || !existing.app_name.trim() ||
        typeof existing.install?.executable !== 'string') continue;
    if (existing.install.platform === HEROIC_PLATFORMS[platform] &&
        await isFile(existing.install.executable)) {
      return { url: heroicLaunchUrl(existing.app_name), executable: existing.install.executable };
    }
  }

  const executable = await scanForCK3(roots, onProgress, platform);
  const appName = await ensureHeroicEntry(configDir, executable, platform);
  return { url: heroicLaunchUrl(appName), executable };
}

module.exports = {
  heroicConfigDirs, driveRoots, scanForCK3, readLibrary,
  ensureHeroicEntry, prepareHeroicCK3
};
