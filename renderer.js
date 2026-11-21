const $ = id => document.getElementById(id);
const desktop = window.app;
const views = document.querySelectorAll('[data-view]');
const archiveZone = $('archiveZone');
const versionField = $('supportedVersion');

let activeView = 'install';
let selectedArchive = null;
let folderPath = null;
let archiveRequest = 0;
let folderRequest = 0;
let libraryRequest = 0;
let scanRequest = 0;
let inspecting = false;
let installing = false;
let installedMods = [];

function report(element, message, tone = '') {
  element.textContent = message;
  if (tone) element.dataset.tone = tone;
  else delete element.dataset.tone;
}

function showView(view, moveFocus = false) {
  activeView = view;
  for (const button of views) {
    if (button.dataset.view === view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
    $(button.dataset.view + 'View').hidden = button.dataset.view !== view;
  }
  $('installActions').hidden = view !== 'install';
  document.querySelector('.content').scrollTop = 0;
  if (view === 'library') void loadInstalledMods();
  if (moveFocus) {
    const heading = $(view + 'View').querySelector('h1');
    heading.tabIndex = -1;
    heading.focus();
  }
}

for (const button of views) {
  button.addEventListener('click', () => showView(button.dataset.view, true));
}

function modFields() {
  return {
    modName: $('modName').value.trim(),
    version: $('modVersion').value.trim(),
    supportedVersion: versionField.value.trim(),
    modId: $('modId').value.trim(),
    tags: $('modTags').value.split(',').map(tag => tag.trim()).filter(Boolean)
  };
}

function updatePreview() {
  const { modName, version, supportedVersion, modId, tags } = modFields();
  const declaredVersion = supportedVersion || ck3.descriptorVersion;
  const lines = [
    'name=' + JSON.stringify(modName || 'Custom Mod'),
    'path="mod/…"',
    'version=' + JSON.stringify(version || '1.0'),
    'supported_version=' + JSON.stringify(declaredVersion)
  ];
  if (modId) lines.push('remote_file_id=' + JSON.stringify(modId));
  if (tags.length) lines.push('tags={ ' + tags.map(tag => JSON.stringify(tag)).join(' ') + ' }');
  $('previewContent').textContent = lines.join('\n');

  const branch = declaredVersion.match(/^(\d+\.\d+)(?:\.\d+)*(?:\.\*)?$/)?.[1];
  const notice = $('versionNotice');
  notice.hidden = !branch || branch === ck3.version;
  notice.textContent = notice.hidden ? '' : 'This mod declares support for CK3 ' + declaredVersion + '. Check its compatibility with ' + ck3.version + ' before playing.';
}

function updateInstallControls() {
  $('installBtn').disabled = !desktop || !selectedArchive || !folderPath || inspecting || installing;
  $('modFields').disabled = installing || inspecting;
  $('zipBtn').disabled = !desktop || installing;
  $('folderBtn').disabled = !desktop || installing;
  $('autoDetectBtn').disabled = !desktop || installing;
}

function updateInstallStatus() {
  updateInstallControls();
  if (installing) return;
  let message = 'Choose a mod ZIP to get started.';
  if (!desktop) message = 'Open the desktop app to install mods.';
  else if (inspecting) message = 'Reading the ZIP archive…';
  else if (selectedArchive) message = folderPath ? 'Ready to install.' : 'Choose your CK3 mods folder.';
  report($('installStatus'), message);
}

function fillMetadata(name, info) {
  const metadata = info?.metadata;
  $('modName').value = metadata?.name || name;
  $('modVersion').value = metadata?.version || '1.0';
  versionField.value = metadata?.supported_version || ck3.descriptorVersion;
  $('modId').value = metadata?.remote_file_id || '';
  $('modTags').value = metadata?.tags?.length ? metadata.tags.join(', ') : 'Historical';
  const status = $('metadataStatus');
  status.hidden = !info;
  status.textContent = info?.foundDescriptor
    ? 'Read from ' + info.descriptorPath
    : 'No descriptor found. Review these defaults before installing.';
  report(status, status.textContent, info?.foundDescriptor ? 'success' : '');
  updatePreview();
}

async function selectArchive(path) {
  const request = ++archiveRequest;
  const name = path.split(/[\\/]/).pop();
  selectedArchive = null;
  inspecting = true;
  $('progressContainer').hidden = true;
  $('archiveTitle').textContent = name;
  $('zipBtn').textContent = 'Change ZIP';
  report($('archiveStatus'), 'Reading archive…');
  fillMetadata(name.replace(/\.zip$/i, ''));
  updateInstallStatus();

  try {
    const info = await desktop.inspectZip(path);
    if (request !== archiveRequest) return;
    if (info.error) throw new Error(info.error);
    if (!info.totalFiles) throw new Error('The ZIP archive is empty.');
    selectedArchive = path;
    fillMetadata(name.replace(/\.zip$/i, ''), info);
    const fileCount = info.totalFiles.toLocaleString() + (info.totalFiles === 1 ? ' file' : ' files');
    report($('archiveStatus'), fileCount + ' · ' + (info.totalSizeMB || '<1') + ' MB', 'success');
  } catch (error) {
    if (request === archiveRequest) report($('archiveStatus'), error.message, 'danger');
  } finally {
    if (request === archiveRequest) {
      inspecting = false;
      updateInstallStatus();
    }
  }
}

function setFolder(path, detected) {
  if (path !== folderPath) {
    installedMods = [];
    $('installedCount').hidden = true;
    emptyResult($('modsList'), 'Loading installed mods…', 'library');
    scanRequest++;
    $('scanConflictsBtn').disabled = false;
    report($('conflictsStatus'), 'Scan your mods folder to check for overlaps.');
    emptyResult($('conflictsList'), 'No scan results yet.', 'conflict');
  }
  folderPath = path;
  report($('folderStatus'), detected ? 'CK3 mods folder detected.' : 'Custom mods folder selected.', 'success');
  $('folderPath').hidden = false;
  $('folderPath').textContent = path;
  $('openModFolderBtn').disabled = false;
  updateInstallStatus();
  void loadInstalledMods();
}

async function detectFolder(background = false) {
  const request = ++folderRequest;
  if (!background) report($('folderStatus'), 'Looking for the CK3 mods folder…');
  try {
    const path = await desktop.autoDetectCK3ModsFolder();
    if (request !== folderRequest || installing) return;
    if (path) setFolder(path, true);
    else if (!background) report($('folderStatus'), 'Auto-detect found no CK3 mods folder. Browse to select it.', 'warning');
  } catch (error) {
    if (!background && request === folderRequest) report($('folderStatus'), error.message, 'danger');
  }
}

function makeIcon(name) {
  const namespace = 'http://www.w3.org/2000/svg';
  const icon = document.createElementNS(namespace, 'svg');
  icon.setAttribute('class', 'icon');
  icon.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(namespace, 'use');
  use.setAttribute('href', '#i-' + name);
  icon.append(use);
  return icon;
}

function element(tag, className, message) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (message) node.textContent = message;
  return node;
}

function emptyResult(container, message, iconName) {
  const state = element('div', 'empty');
  const icon = element('span', 'panel-icon');
  icon.append(makeIcon(iconName));
  state.append(icon, element('p', '', message));
  container.replaceChildren(state);
}

function modAction(message, handler, danger = false) {
  const button = element('button', 'button outline' + (danger ? ' danger-button' : ''), message);
  button.type = 'button';
  button.addEventListener('click', handler);
  return button;
}

function chip(message, tone) {
  const node = element('span', 'chip', message);
  if (tone) node.dataset.tone = tone;
  return node;
}

function renderInstalledMods() {
  if (!folderPath) return;
  const list = $('modsList');
  const query = $('searchModsInput').value.trim().toLowerCase();
  const mods = installedMods.filter(mod => [mod.name, mod.version, mod.remoteFileId]
    .some(field => String(field ?? '').toLowerCase().includes(query)));
  if (!mods.length) {
    emptyResult(list, query ? 'No mods match your search.' : 'No installed mods found in this folder.', 'library');
    return;
  }

  const rows = document.createDocumentFragment();
  for (const mod of mods) {
    const row = element('article', 'result-row');
    const details = element('div');
    const metadata = element('div', 'chips');
    metadata.append(chip('v' + mod.version));
    if (mod.supportedVersion) metadata.append(chip('CK3 ' + mod.supportedVersion));
    if (mod.remoteFileId && String(mod.remoteFileId) !== '0') metadata.append(chip('Steam ID ' + mod.remoteFileId));
    if (!mod.dirExists) metadata.append(chip('Mod folder missing', 'warning'));
    for (const tag of mod.tags.slice(0, 3)) metadata.append(chip(tag));
    details.append(element('h3', '', mod.name), metadata);

    const actions = element('div', 'result-actions');
    const location = folderPath;
    actions.append(
      modAction('Open folder', () => openFolder(mod.dirExists ? mod.targetDir : location)),
      modAction('Uninstall', async event => {
        if (!confirm('Uninstall "' + mod.name + '"?')) return;
        const button = event.currentTarget;
        button.disabled = true;
        try {
          const result = await desktop.deleteMod({ modFileName: mod.modFileName, folderPath: location });
          if (!result.success) throw new Error(result.error);
          await loadInstalledMods();
        } catch (error) {
          alert('Could not uninstall the mod. ' + error.message);
          button.disabled = false;
        }
      }, true)
    );
    row.append(details, actions);
    rows.append(row);
  }
  list.replaceChildren(rows);
}

async function loadInstalledMods() {
  if (!folderPath) {
    emptyResult($('modsList'), desktop ? 'Choose a mods folder in Install mod to view your library.' : 'Your installed mods are available in the desktop app.', 'library');
    return;
  }
  const request = ++libraryRequest;
  $('refreshModsBtn').disabled = true;
  try {
    const mods = await desktop.listInstalledMods(folderPath);
    if (request !== libraryRequest) return;
    installedMods = mods;
    $('installedCount').textContent = installedMods.length;
    $('installedCount').hidden = false;
    renderInstalledMods();
  } catch (error) {
    if (request === libraryRequest) emptyResult($('modsList'), 'Could not load installed mods. ' + error.message, 'library');
  } finally {
    if (request === libraryRequest) $('refreshModsBtn').disabled = false;
  }
}

async function scanConflicts() {
  if (!folderPath) {
    report($('conflictsStatus'), 'Choose a mods folder in Install mod to run a scan.', 'warning');
    return;
  }
  const request = ++scanRequest;
  const list = $('conflictsList');
  $('scanConflictsBtn').disabled = true;
  report($('conflictsStatus'), 'Scanning installed mod files…');
  list.replaceChildren();

  try {
    const { totalModsScanned, conflicts, error } = await desktop.checkConflicts(folderPath);
    if (request !== scanRequest) return;
    if (error) throw new Error(error);
    const scanned = 'Scanned ' + totalModsScanned + (totalModsScanned === 1 ? ' mod.' : ' mods.');
    report($('conflictsStatus'), scanned + ' ' + conflicts.length + (conflicts.length === 1 ? ' file overlap found.' : ' file overlaps found.'));
    if (!conflicts.length) {
      emptyResult(list, totalModsScanned ? 'No overlapping files found.' : 'No mod folders were available to scan.', 'conflict');
      return;
    }

    const rows = document.createDocumentFragment();
    for (const conflict of conflicts) {
      const row = element('article', 'result-row');
      const details = element('div');
      const mods = element('div', 'chips');
      mods.append(...conflict.mods.map(name => chip(name)));
      details.append(element('h3', 'conflict-path', conflict.file), mods);
      row.append(details);
      rows.append(row);
    }
    list.replaceChildren(rows);
  } catch (error) {
    if (request === scanRequest) report($('conflictsStatus'), 'Scan failed. ' + error.message, 'danger');
  } finally {
    if (request === scanRequest) $('scanConflictsBtn').disabled = false;
  }
}

async function openFolder(path) {
  try {
    if (!await desktop.openPath(path)) throw new Error('The folder could not be opened.');
  } catch (error) {
    alert(error.message);
  }
}

async function launch(method, name) {
  $('launchGameBtn').disabled = true;
  $('launchHeroicBtn').disabled = true;
  const status = $('launchStatus');
  status.hidden = false;
  report(status, 'Preparing CK3 for ' + name + '…');
  try {
    const result = await method();
    if (!result.success) throw new Error(result.error);
    report(status, 'Launch request sent to ' + name + '.');
  } catch (error) {
    report(status, error.message, 'danger');
  } finally {
    $('launchGameBtn').disabled = false;
    $('launchHeroicBtn').disabled = false;
  }
}

function updateProgress({ percent, message, size, speed, eta }) {
  $('progressBar').value = percent;
  $('progressPercent').textContent = percent + '%';
  $('progressFiles').textContent = message;
  $('progressSize').textContent = size || '';
  $('progressSpeed').textContent = speed || '';
  $('progressETA').textContent = eta ? 'ETA ' + eta : '';
}

async function install() {
  if ($('installBtn').disabled) return;
  installing = true;
  updateInstallControls();
  $('progressContainer').hidden = false;
  updateProgress({ percent: 0, message: 'Preparing archive…' });
  report($('installStatus'), 'Installing mod…');
  try {
    const result = await desktop.install({ zipPath: selectedArchive, folderPath, ...modFields() });
    if (!result.success) throw new Error(result.error);
    report($('installStatus'), 'Mod installed. Enable it in your CK3 playset.', 'success');
    void loadInstalledMods();
  } catch (error) {
    report($('installStatus'), 'Installation failed. ' + error.message, 'danger');
  } finally {
    installing = false;
    updateInstallControls();
  }
}

$('gameVersion').textContent = 'CK3 ' + ck3.version + ' · ' + ck3.codename;
versionField.value = ck3.descriptorVersion;
versionField.placeholder = ck3.descriptorVersion;
$('modFields').addEventListener('input', updatePreview);
$('searchModsInput').addEventListener('input', renderInstalledMods);
updatePreview();
updateInstallStatus();
void loadInstalledMods();

if (desktop) {
  $('windowControls').hidden = false;
  for (const button of document.querySelectorAll('[data-window-action]')) {
    button.addEventListener('click', () => desktop[button.dataset.windowAction]());
  }

  window.addEventListener('dragover', event => {
    if (!event.dataTransfer.types.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = installing ? 'none' : 'copy';
    if (!installing && activeView === 'install') archiveZone.setAttribute('data-dragging', '');
  });
  window.addEventListener('dragleave', event => {
    if (!event.relatedTarget) archiveZone.removeAttribute('data-dragging');
  });
  window.addEventListener('drop', event => {
    event.preventDefault();
    archiveZone.removeAttribute('data-dragging');
    const file = event.dataTransfer.files[0];
    if (!file || installing) return;
    if (activeView !== 'install') showView('install');
    try {
      if (!/\.zip$/i.test(file.name)) throw new Error('Choose a .zip archive.');
      const path = desktop.getDroppedFilePath(file);
      if (!path) throw new Error('Could not read this file. Use Choose ZIP to select it.');
      void selectArchive(path);
    } catch (error) {
      report($('archiveStatus'), error.message, 'danger');
    }
  });

  $('zipBtn').addEventListener('click', async () => {
    try {
      const path = await desktop.pickZip();
      if (path && !installing) await selectArchive(path);
    } catch (error) {
      report($('archiveStatus'), error.message, 'danger');
    }
  });
  $('autoDetectBtn').addEventListener('click', () => detectFolder());
  $('folderBtn').addEventListener('click', async () => {
    const request = ++folderRequest;
    try {
      const path = await desktop.pickFolder();
      if (path && !installing && request === folderRequest) setFolder(path, false);
    } catch (error) {
      if (request === folderRequest) report($('folderStatus'), error.message, 'danger');
    }
  });

  $('openModFolderBtn').addEventListener('click', () => openFolder(folderPath));
  $('launchGameBtn').addEventListener('click', () => launch(desktop.launchGame, 'Steam'));
  $('launchHeroicBtn').addEventListener('click', () => launch(desktop.launchHeroicCK3, 'Heroic'));
  desktop.onHeroicScanProgress(({ drive, directories, targetName }) => {
    report($('launchStatus'), 'Searching ' + drive + ' for ' + (targetName || 'CK3') + ' · ' + directories.toLocaleString() + ' folders checked');
  });

  $('installBtn').addEventListener('click', install);
  $('refreshModsBtn').addEventListener('click', loadInstalledMods);
  $('scanConflictsBtn').addEventListener('click', scanConflicts);
  desktop.onProgressUpdate(updateProgress);
  requestAnimationFrame(() => {
    setTimeout(() => {
      if (!folderRequest) void detectFolder(true);
    }, 0);
  });
} else {
  for (const button of document.querySelectorAll('[data-desktop]')) button.disabled = true;
}
