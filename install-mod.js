const fs = require('node:fs');
const path = require('node:path');
const { pipeline } = require('node:stream/promises');
const yauzl = require('yauzl-promise');
const ck3 = require('./game-version');
const { readArchiveDescriptor, serializeClausewitz } = require('./clausewitz');

async function reserveFolder(destination, rootName, name) {
  const slug = name.toLowerCase().replace(/[^a-z0-9_-]+/g, '_').slice(0, 32);
  const preferred = [rootName, slug].filter(candidate => candidate && !['.', '..', 'mod'].includes(candidate));
  let slot = 0;
  while (true) {
    const folder = preferred.shift() || 'mod' + ++slot;
    const directory = path.join(destination, folder);
    const descriptor = directory + '.mod';
    try {
      await fs.promises.lstat(descriptor);
      continue;
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    try {
      await fs.promises.mkdir(directory);
      return { folder, directory, descriptor };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
}

async function installMod(data, onProgress = () => {}) {
  const zip = await yauzl.open(data.zipPath, { supportMacArchive: true });
  let location;
  let externalCreated = false;
  try {
    const entries = await zip.readEntries();
    const files = entries.filter(entry => !entry.filename.endsWith('/'));
    if (!files.length) throw new Error('The ZIP archive is empty.');

    const { entry: sourceDescriptor, parsed: metadata } = await readArchiveDescriptor(entries);
    let prefix = '';
    if (sourceDescriptor && /(^|\/)descriptor\.mod$/i.test(sourceDescriptor.filename)) {
      prefix = sourceDescriptor.filename.slice(0, sourceDescriptor.filename.lastIndexOf('/') + 1);
    } else {
      const content = files.filter(entry => entry !== sourceDescriptor);
      const first = content[0]?.filename || '';
      const topLevel = first.slice(0, first.indexOf('/') + 1);
      if (topLevel && content.every(entry => entry.filename.startsWith(topLevel))) prefix = topLevel;
    }
    delete metadata.path;
    delete metadata.archive;
    metadata.name = String((data.modName ?? metadata.name) || 'Custom Mod');
    metadata.version = (data.version ?? metadata.version) || '1.0';
    const supportedVersion = data.supportedVersion?.trim() ?? metadata.supported_version;
    metadata.supported_version = supportedVersion || ck3.descriptorVersion;
    metadata.remote_file_id = (data.modId ?? metadata.remote_file_id) || '0';
    if (data.tags) metadata.tags = data.tags;
    metadata.tags ??= ['Historical', 'Utilities'];

    location = await reserveFolder(data.folderPath, path.posix.basename(prefix), metadata.name);
    const isPayload = entry => entry !== sourceDescriptor
      && entry.filename.startsWith(prefix)
      && !/^descriptor\.mod\/?$/i.test(entry.filename.slice(prefix.length));
    const payload = files.filter(isPayload);
    const totalSize = payload.reduce((sum, entry) => sum + Number(entry.uncompressedSize), 0);
    const formatSize = bytes => {
      if (bytes < 1024) return Math.round(bytes) + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    };
    const start = Date.now();
    let count = 0;
    let size = 0;

    for (const entry of entries) {
      if (!isPayload(entry)) continue;
      const name = entry.filename.slice(prefix.length);
      if (!name) continue;
      const target = path.resolve(location.directory, name);
      const relative = path.relative(location.directory, target);
      if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) {
        throw new Error('An archive entry is outside the mod folder.');
      }
      if (entry.filename.endsWith('/')) {
        await fs.promises.mkdir(target, { recursive: true });
        continue;
      }

      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      const stream = await entry.openReadStream();
      await pipeline(stream, fs.createWriteStream(target));

      count++;
      size += Number(entry.uncompressedSize);
      const elapsed = Math.max(1, Date.now() - start);
      const bytesPerMs = size / elapsed;
      onProgress({
        percent: Math.round(count / payload.length * 95),
        message: 'Extracting ' + path.basename(target),
        size: formatSize(size) + ' / ' + formatSize(totalSize),
        speed: formatSize(bytesPerMs * 1000) + '/s',
        eta: bytesPerMs ? Math.ceil((totalSize - size) / bytesPerMs / 1000) + 's' : ''
      });
    }

    await fs.promises.writeFile(path.join(location.directory, 'descriptor.mod'), serializeClausewitz(metadata));
    const external = await fs.promises.open(location.descriptor, 'wx');
    externalCreated = true;
    try {
      await external.writeFile(serializeClausewitz({ ...metadata, path: 'mod/' + location.folder }));
    } finally {
      await external.close();
    }

    onProgress({
      percent: 100,
      message: count + (count === 1 ? ' file extracted' : ' files extracted'),
      size: formatSize(totalSize)
    });
    return { success: true };
  } catch (error) {
    if (location) {
      const cleanup = [fs.promises.rm(location.directory, { recursive: true, force: true })];
      if (externalCreated) cleanup.push(fs.promises.unlink(location.descriptor));
      await Promise.allSettled(cleanup);
    }
    throw error;
  } finally {
    await zip.close();
  }
}

module.exports = { installMod };
