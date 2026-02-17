#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const LOCALES_DIR = path.join(ROOT, '_locales');

const SUPPORTED = [
  { code: 'pt-BR', folder: 'pt_BR' },
  { code: 'en-US', folder: 'en_US' },
  { code: 'es-419', folder: 'es_419' },
  { code: 'fr', folder: 'fr' },
  { code: 'de', folder: 'de' },
  { code: 'it', folder: 'it' },
  { code: 'tr', folder: 'tr' },
  { code: 'zh-CN', folder: 'zh_CN' },
  { code: 'hi', folder: 'hi' },
  { code: 'ar', folder: 'ar' },
  { code: 'bn', folder: 'bn' },
  { code: 'ru', folder: 'ru' },
  { code: 'ur', folder: 'ur' },
];

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
  const basePtFolder = path.join(LOCALES_DIR, 'pt_BR');
  const basePtRaw = await readMessages(basePtFolder);

  if (Object.keys(basePtRaw).length === 0) {
    throw new Error(
      `Locale base pt_BR não encontrado ou vazio: ${path.join(basePtFolder, 'messages.json')}`
    );
  }

  for (const entry of SUPPORTED) {
    const folderPath = path.join(LOCALES_DIR, entry.folder);
    const existing = await readMessages(folderPath);

    const merged = { ...basePtRaw, ...existing };

    await writeMessages(folderPath, merged);
    console.log(`[i18n] Atualizado ${entry.code} em ${folderPath}`);
  }
}

sync().catch((error) => {
  console.error('[i18n] Falha ao sincronizar traduções do site:', error);
  process.exitCode = 1;
});
