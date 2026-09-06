/**
 * Clausewitz Script & Paradox .mod Parser / Serializer
 * Harvested and ported from SquiresWay / Irony Mod Manager logic for pure Node.js.
 */
const yauzl = require('yauzl-promise');

/**
 * Tokenize a Paradox Clausewitz script string.
 * Handles strings, escaped quotes, comments, braces, and equals signs.
 */
function tokenizeClausewitz(text) {
  const tokens = [];
  let i = 0;
  const len = text.length;

  while (i < len) {
    const ch = text[i];

    // Skip whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }

    // Skip comments
    if (ch === '#') {
      while (i < len && text[i] !== '\n' && text[i] !== '\r') {
        i++;
      }
      continue;
    }

    // Single character tokens
    if (ch === '=' || ch === '{' || ch === '}') {
      tokens.push({ type: ch, value: ch });
      i++;
      continue;
    }

    // Quoted strings
    if (ch === '"') {
      i++; // skip opening quote
      let str = '';
      while (i < len) {
        if (text[i] === '\\' && i + 1 < len) {
          str += text[i + 1];
          i += 2;
        } else if (text[i] === '"') {
          i++; // skip closing quote
          break;
        } else {
          str += text[i];
          i++;
        }
      }
      tokens.push({ type: 'STRING', value: str });
      continue;
    }

    // Bare words / identifiers / numbers
    let word = '';
    while (i < len && !/\s/.test(text[i]) && text[i] !== '=' && text[i] !== '{' && text[i] !== '}' && text[i] !== '#' && text[i] !== '"') {
      word += text[i];
      i++;
    }
    if (word.length > 0) {
      tokens.push({ type: 'IDENT', value: word });
    }
  }

  return tokens;
}

/**
 * Parse tokens into a JavaScript object.
 */
function parseTokens(tokens) {
  let pos = 0;

  function parseBlock() {
    const result = {};
    const list = [];
    let isList = true;

    while (pos < tokens.length) {
      const tok = tokens[pos];

      if (tok.type === '}') {
        pos++;
        return isList && list.length > 0 ? list : result;
      }

      // Check if next token is '=' (key = value)
      if ((tok.type === 'IDENT' || tok.type === 'STRING') && pos + 1 < tokens.length && tokens[pos + 1].type === '=') {
        isList = false;
        const key = tok.value;
        pos += 2; // skip key and '='

        if (pos >= tokens.length) break;

        const valTok = tokens[pos];
        let val;

        if (valTok.type === '{') {
          pos++; // skip '{'
          val = parseBlock();
        } else {
          val = valTok.value;
          pos++;
        }

        if (key in result) {
          if (Array.isArray(result[key])) {
            result[key].push(val);
          } else {
            result[key] = [result[key], val];
          }
        } else {
          result[key] = val;
        }
      } else {
        // Plain value inside a block, e.g. tags = { "History" "Overhaul" }
        if (tok.type === '{') {
          pos++;
          list.push(parseBlock());
        } else {
          list.push(tok.value);
          pos++;
        }
      }
    }

    return isList && list.length > 0 ? list : result;
  }

  return parseBlock();
}

/**
 * Parse Clausewitz script text into an object.
 */
function parseClausewitz(text) {
  if (!text || typeof text !== 'string') return {};
  const tokens = tokenizeClausewitz(text);
  return parseTokens(tokens);
}

/**
 * Serialize a JS object into valid Paradox Clausewitz format.
 */
function serializeClausewitz(obj, indentLevel = 0) {
  const indent = '\t'.repeat(indentLevel);
  let output = '';

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (typeof item === 'object' && item !== null) {
        output += `${indent}{\n${serializeClausewitz(item, indentLevel + 1)}${indent}}\n`;
      } else {
        const clean = String(item).replace(/"/g, '\\"');
        output += `${indent}"${clean}"\n`;
      }
    }
    return output;
  }

  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      // Check if it's multiple repeat keys (e.g. replace_path) or a list container (e.g. tags)
      if (key === 'replace_path' || key === 'dependencies_list') {
        for (const item of value) {
          const clean = String(item).replace(/"/g, '\\"');
          output += `${indent}${key}="${clean}"\n`;
        }
      } else {
        output += `${indent}${key}={\n`;
        for (const item of value) {
          const clean = String(item).replace(/"/g, '\\"');
          output += `${indent}\t"${clean}"\n`;
        }
        output += `${indent}}\n`;
      }
    } else if (typeof value === 'object') {
      output += `${indent}${key}={\n`;
      output += serializeClausewitz(value, indentLevel + 1);
      output += `${indent}}\n`;
    } else {
      const clean = String(value).replace(/"/g, '\\"');
      output += `${indent}${key}="${clean}"\n`;
    }
  }

  return output;
}

/**
 * Inspect a ZIP archive and read descriptor.mod or *.mod without extracting the entire archive.
 */
async function inspectZipDescriptor(zipPath) {
  let zip;
  try {
    zip = await yauzl.open(zipPath, { supportMacArchive: true });
    const entries = await zip.readEntries();

    let descriptorEntry = null;
    let fallbackModEntry = null;
    let thumbnailEntry = null;

    for (const entry of entries) {
      if (entry.filename.endsWith('/')) continue;
      const baseName = entry.filename.split('/').pop().toLowerCase();

      if (baseName === 'descriptor.mod') {
        if (!descriptorEntry || entry.filename.split('/').length < descriptorEntry.filename.split('/').length) {
          descriptorEntry = entry;
        }
      } else if (baseName.endsWith('.mod') && !fallbackModEntry) {
        fallbackModEntry = entry;
      }

      if (/\.(png|jpg|jpeg)$/i.test(baseName) && (baseName.includes('thumb') || baseName.includes('picture') || baseName === 'thumbnail.png')) {
        thumbnailEntry = entry;
      }
    }

    const chosenEntry = descriptorEntry || fallbackModEntry;
    let parsed = null;
    let rawText = '';

    if (chosenEntry) {
      const stream = await chosenEntry.openReadStream();
      const chunks = [];
      for await (const chunk of stream) {
        chunks.push(chunk);
      }
      rawText = Buffer.concat(chunks).toString('utf8');
      parsed = parseClausewitz(rawText);
    }

    const nonDirEntries = entries.filter(e => !e.filename.endsWith('/'));
    const firstFolders = [...new Set(nonDirEntries.map(e => e.filename.split('/')[0]).filter(Boolean))];
    const detectedRootFolder = firstFolders.length === 1 ? firstFolders[0] : null;

    const totalFiles = nonDirEntries.length;
    const totalSize = nonDirEntries.reduce((sum, e) => sum + Number(e.uncompressedSize), 0);

    return {
      foundDescriptor: !!chosenEntry,
      descriptorPath: chosenEntry ? chosenEntry.filename : null,
      totalFiles,
      totalSizeMB: Math.round(totalSize / 1024 / 1024),
      rootFolder: detectedRootFolder,
      thumbnailName: thumbnailEntry ? thumbnailEntry.filename : null,
      metadata: {
        name: parsed?.name || null,
        version: parsed?.version || null,
        supported_version: parsed?.supported_version || null,
        remote_file_id: parsed?.remote_file_id || null,
        tags: Array.isArray(parsed?.tags) ? parsed.tags : (parsed?.tags ? [parsed.tags] : []),
        picture: parsed?.picture || null,
        rawText
      }
    };
  } finally {
    if (zip) await zip.close();
  }
}

module.exports = {
  tokenizeClausewitz,
  parseClausewitz,
  serializeClausewitz,
  inspectZipDescriptor
};
