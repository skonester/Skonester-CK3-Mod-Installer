const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');
const { parseClausewitz } = require('../clausewitz');
const { installMod } = require('../install-mod');

const zipPath = path.join(__dirname, 'fixtures', 'florin-mod.zip');

async function installFixture(t, options = {}) {
  const folderPath = await fs.mkdtemp(path.join(os.tmpdir(), 'ck3-install-test-'));
  t.after(() => fs.rm(folderPath, { recursive: true, force: true }));
  await installMod({ zipPath, folderPath, ...options });
  const target = path.join(folderPath, 'florin_fixture');
  const external = parseClausewitz(await fs.readFile(target + '.mod', 'utf8'));
  const internal = parseClausewitz(await fs.readFile(path.join(target, 'descriptor.mod'), 'utf8'));
  return { external, internal, target, folderPath };
}

test('installs a mod folder packaged beside its launcher descriptor and defaults to CK3 1.21', async t => {
  const { external, internal, target, folderPath } = await installFixture(t);

  assert.deepEqual((await fs.readdir(folderPath)).sort(), ['florin_fixture', 'florin_fixture.mod']);
  assert.equal(await fs.readFile(path.join(target, 'events', 'fixture', 'events.txt'), 'utf8'), '# Test content\n');
  assert.deepEqual(external, { ...internal, path: 'mod/florin_fixture' });
  assert.equal(internal.supported_version, '1.21.*');
  assert.deepEqual(internal.dependencies, ['Base Mod']);
  assert.deepEqual(internal.replace_path, ['events/fixture', 'common/fixture']);
});

test('writes an explicit supported version to both descriptors', async t => {
  const { external, internal } = await installFixture(t, { supportedVersion: ' 1.21.0.3 ' });
  assert.equal(external.supported_version, '1.21.0.3');
  assert.equal(internal.supported_version, external.supported_version);
});
