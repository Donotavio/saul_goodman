#!/usr/bin/env node
/**
 * Syncs vscode-extension/_locales/ — propagates missing keys from en_US
 * (the authoritative locale) into all other locales, preserving existing
 * translations.  New entries keep the en_US message as a placeholder until
 * they are translated (manually or via LLM repair).
 *
 * Usage:
 *   node vscode-extension/scripts/sync-locales.js
 *   npm --prefix vscode-extension run i18n:sync
 */
const fs = require('node:fs/promises');
const path = require('node:path');

const VSCODE_ROOT = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(VSCODE_ROOT, '_locales');

async function readMessages(folder) {
  try {
    const content = await fs.readFile(path.join(folder, 'messages.json'), 'utf-8');
    const parsed = JSON.parse(content);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('messages.json não contém um objeto JSON válido.');
    }
    return parsed;
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeMessages(folder, messages) {
  await fs.mkdir(folder, { recursive: true });
  const ordered = Object.keys(messages)
    .sort((a, b) => a.localeCompare(b))
    .reduce((acc, key) => {
      acc[key] = messages[key];
      return acc;
    }, {});
  const payload = JSON.stringify(ordered, null, 2);
  await fs.writeFile(path.join(folder, 'messages.json'), `${payload}\n`, 'utf-8');
}

async function sync() {
  const baseFolder = path.join(LOCALES_DIR, 'en_US');
  const baseRaw = await readMessages(baseFolder);

  if (Object.keys(baseRaw).length === 0) {
    throw new Error(
      `Locale base en_US não encontrado ou vazio: ${path.join(baseFolder, 'messages.json')}`
    );
  }

  const locales = await fs.readdir(LOCALES_DIR);
  let totalAdded = 0;

  for (const entry of locales) {
    const folderPath = path.join(LOCALES_DIR, entry);
    const stat = await fs.stat(folderPath);
    if (!stat.isDirectory()) continue;

    const existing = await readMessages(folderPath);
    const before = Object.keys(existing).length;

    // Merge: base provides missing keys, existing translations are preserved
    const merged = { ...baseRaw, ...existing };

    await writeMessages(folderPath, merged);

    const after = Object.keys(merged).length;
    const added = after - before;
    totalAdded += added;

    if (added > 0) {
      console.log(`[vscode-i18n] ${entry}: +${added} keys (${before} → ${after})`);
    } else {
      console.log(`[vscode-i18n] ${entry}: up to date (${after} keys)`);
    }
  }

  console.log(`\n[vscode-i18n] Sync complete. ${totalAdded} keys added across all locales.`);
}

sync().catch((error) => {
  console.error('[vscode-i18n] Falha ao sincronizar:', error);
  process.exitCode = 1;
});
