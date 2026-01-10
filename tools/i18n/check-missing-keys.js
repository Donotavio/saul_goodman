#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');
const LOCALES_DIR = path.join(ROOT, '_locales');
const DEFAULT_LOCALE = { code: 'pt-BR', folder: 'pt_BR' };

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

async function loadMessages(folder) {
  try {
    const content = await fs.readFile(
      path.join(LOCALES_DIR, folder, 'messages.json'),
      'utf-8'
    );
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

function flattenMessages(raw) {
  return Object.entries(raw || {}).reduce((acc, [key, value]) => {
    if (value && typeof value.message === 'string') {
      acc[key] = value.message;
    }
    return acc;
  }, {});
}

async function main() {
  const defaultMessages = flattenMessages(await loadMessages(DEFAULT_LOCALE.folder));
  const defaultKeys = new Set(Object.keys(defaultMessages));
  const report = [];

  for (const locale of SUPPORTED) {
    const raw = flattenMessages(await loadMessages(locale.folder));
    const missing = [];
    const extra = [];
    defaultKeys.forEach((key) => {
      if (!(key in raw)) missing.push(key);
    });
    Object.keys(raw).forEach((key) => {
      if (!defaultKeys.has(key)) extra.push(key);
    });

    report.push({
      locale: locale.code,
      missingCount: missing.length,
      extraCount: extra.length,
      missing,
      extra,
    });
  }

  const lines = report
    .map((entry) => {
      const header = `${entry.locale}: ${entry.missingCount} missing, ${entry.extraCount} extra`;
      const detail =
        entry.missingCount === 0
          ? ''
          : `  missing keys: ${entry.missing.slice(0, 5).join(', ')}${
              entry.missing.length > 5 ? '…' : ''
            }`;
      return detail ? `${header}\n${detail}` : header;
    })
    .join('\n');

  console.log(lines);
}

main().catch((error) => {
  console.error('[i18n] Failed to check missing keys:', error);
  process.exitCode = 1;
});
