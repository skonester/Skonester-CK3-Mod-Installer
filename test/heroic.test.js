const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { scanForCK3, readLibrary, prepareHeroicCK3 } = require('../heroic');

function fixture(platform = 'win32') {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-heroic-test-'));
  const binaries = path.join(root, 'unusual', 'place', 'My CK3', 'binaries');
  const gameDir = platform === 'darwin'
    ? path.join(binaries, 'ck3.app', 'Contents', 'MacOS') : binaries;
  const configDir = path.join(root, 'HeroicConfig');
  fs.mkdirSync(gameDir, { recursive: true });
  fs.mkdirSync(path.join(configDir, 'sideload_apps'), { recursive: true });
  const executable = path.join(gameDir, platform === 'win32' ? 'ck3.exe' : 'ck3');
  fs.writeFileSync(executable, 'fixture');
  return {
    root, gameDir, configDir, executable,
    cleanup() {
      assert.equal(path.dirname(root), os.tmpdir());
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

test('scans an arbitrary location and registers CK3 without Steam', async () => {
  const f = fixture();
  try {
    const unrelated = { runner: 'sideload', app_name: 'other-game', title: 'Other Game' };
    const file = path.join(f.configDir, 'sideload_apps', 'library.json');
    fs.writeFileSync(file, JSON.stringify({ games: [unrelated], customSetting: 12 }));
    const progress = [];
    assert.equal(await scanForCK3([f.root], update => progress.push(update), 'win32'), f.executable);
    const result = await prepareHeroicCK3({
      platform: 'win32', configDirs: [f.configDir], roots: [f.root], onProgress: update => progress.push(update)
    });
    assert.match(result.url, /^heroic:\/\/launch\?appName=skonester-ck3-[a-f0-9]+&runner=sideload$/);
    assert.equal(result.executable, f.executable);
    assert.ok(progress.length > 0);
    const library = readLibrary(f.configDir);
    assert.equal(library.customSetting, 12);
    assert.deepEqual(library.games[0], unrelated);
    assert.equal(library.games[1].install.executable, f.executable);
    assert.equal(library.games[1].install.platform, 'Windows');
    assert.ok(fs.existsSync(`${file}.ck3-installer-backup`));

    // A later click reuses the registered path without scanning drives again.
    const again = await prepareHeroicCK3({ platform: 'win32', configDirs: [f.configDir], roots: [] });
    assert.deepEqual(again, result);
    assert.equal(readLibrary(f.configDir).games.length, 2);
  } finally {
    f.cleanup();
  }
});

test('reuses an existing Heroic CK3 entry and preserves its settings', async () => {
  const f = fixture();
  try {
    const entry = {
      runner: 'sideload', app_name: 'heroic-generated-id', title: 'Crusader Kings III',
      install: { executable: f.executable, platform: 'Windows' }, is_installed: true,
      art_cover: 'custom-art'
    };
    fs.writeFileSync(path.join(f.configDir, 'sideload_apps', 'library.json'),
      JSON.stringify({ games: [entry] }));
    const result = await prepareHeroicCK3({ platform: 'win32', configDirs: [f.configDir], roots: [] });
    assert.equal(result.url, 'heroic://launch?appName=heroic-generated-id&runner=sideload');
    assert.deepEqual(readLibrary(f.configDir).games, [entry]);
  } finally {
    f.cleanup();
  }
});

test('repairs the installer-created Heroic entry when CK3 moves', async () => {
  const f = fixture();
  try {
    const file = path.join(f.configDir, 'sideload_apps', 'library.json');
    fs.writeFileSync(file, JSON.stringify({ games: [{
      runner: 'sideload', app_name: 'skonester-ck3-old', title: 'Crusader Kings III',
      install: { executable: path.join(f.root, 'missing', 'ck3.exe'), platform: 'Windows' },
      is_installed: true
    }] }));
    const result = await prepareHeroicCK3({ platform: 'win32', configDirs: [f.configDir], roots: [f.root] });
    assert.equal(result.url, 'heroic://launch?appName=skonester-ck3-old&runner=sideload');
    const games = readLibrary(f.configDir).games;
    assert.equal(games.length, 1);
    assert.equal(games[0].install.executable, f.executable);
  } finally {
    f.cleanup();
  }
});

test('does not overwrite malformed Heroic data or invent a game location', async () => {
  const f = fixture();
  try {
    const file = path.join(f.configDir, 'sideload_apps', 'library.json');
    fs.writeFileSync(file, 'broken-json');
    await assert.rejects(
      prepareHeroicCK3({ platform: 'win32', configDirs: [f.configDir], roots: [f.root] }),
      /could not be read/
    );
    assert.equal(fs.readFileSync(file, 'utf8'), 'broken-json');
    fs.writeFileSync(file, '{"games":[]}');
    fs.rmSync(f.executable);
    await assert.rejects(scanForCK3([f.root], () => {}, 'win32'), /Could not find ck3.exe/);
  } finally {
    f.cleanup();
  }
});

for (const [platform, heroicPlatform, name] of [
  ['linux', 'linux', 'ck3'], ['darwin', 'Mac', 'ck3.app']
]) {
  test(`finds native ${platform} CK3 and registers it for Heroic`, async () => {
    const f = fixture(platform);
    try {
      const progress = [];
      assert.equal(await scanForCK3([f.root], update => progress.push(update), platform), f.executable);
      assert.equal(progress[0].targetName, name);
      const result = await prepareHeroicCK3({
        platform, configDirs: [f.configDir], roots: [f.root]
      });
      assert.equal(result.executable, f.executable);
      const game = readLibrary(f.configDir).games[0];
      assert.equal(game.install.platform, heroicPlatform);
      assert.equal(game.folder_name, platform === 'darwin'
        ? path.dirname(path.dirname(path.dirname(path.dirname(f.executable))))
        : path.dirname(f.executable));
      assert.match(result.url, /runner=sideload$/);
    } finally {
      f.cleanup();
    }
  });
}

test('ignores an existing CK3 entry for another operating system', async () => {
  const f = fixture('linux');
  try {
    const otherExecutable = path.join(f.root, 'ck3.exe');
    fs.writeFileSync(otherExecutable, 'fixture');
    const existing = {
      runner: 'sideload', app_name: 'windows-ck3', title: 'Crusader Kings III',
      install: { executable: otherExecutable, platform: 'Windows' }, is_installed: true
    };
    fs.writeFileSync(path.join(f.configDir, 'sideload_apps', 'library.json'),
      JSON.stringify({ games: [existing] }));
    const result = await prepareHeroicCK3({ platform: 'linux', configDirs: [f.configDir], roots: [f.root] });
    assert.notEqual(result.url, 'heroic://launch?appName=windows-ck3&runner=sideload');
    const games = readLibrary(f.configDir).games;
    assert.deepEqual(games[0], existing);
    assert.equal(games[1].install.platform, 'linux');
  } finally {
    f.cleanup();
  }
});

test('checks standard native Steam locations before scanning folders', async () => {
  for (const [platform, steamFolder] of [
    ['linux', path.join('.local', 'share', 'Steam')],
    ['darwin', path.join('Library', 'Application Support', 'Steam')]
  ]) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ck3-steam-test-'));
    try {
      const exe = path.join(root, steamFolder, 'steamapps', 'common', 'Crusader Kings III',
        'binaries', ...(platform === 'darwin' ? ['ck3.app', 'Contents', 'MacOS'] : []), 'ck3');
      fs.mkdirSync(path.dirname(exe), { recursive: true });
      fs.writeFileSync(exe, 'fixture');
      let scanned = false;
      assert.equal(await scanForCK3([root], () => { scanned = true; }, platform), exe);
      assert.equal(scanned, false);
    } finally {
      assert.equal(path.dirname(root), os.tmpdir());
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});
