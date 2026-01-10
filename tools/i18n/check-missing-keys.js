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

function extractPlaceholders(message) {
  const curlyBraces = [...message.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]);
  const dollarSigns = [...message.matchAll(/\$(\d+)/g)].map((m) => m[1]);
  return { curlyBraces, dollarSigns };
}

function validatePlaceholders(key, defaultMsg, localeMsg, locale) {
  const defaultPh = extractPlaceholders(defaultMsg);
  const localePh = extractPlaceholders(localeMsg);
  const issues = [];

  if (defaultPh.curlyBraces.length !== localePh.curlyBraces.length) {
    issues.push(`Placeholder mismatch in ${locale}:${key} - expected ${defaultPh.curlyBraces.length} {}, found ${localePh.curlyBraces.length}`);
  }
  if (defaultPh.dollarSigns.length !== localePh.dollarSigns.length) {
    issues.push(`Placeholder mismatch in ${locale}:${key} - expected ${defaultPh.dollarSigns.length} $N, found ${localePh.dollarSigns.length}`);
  }

  return issues;
}

// Tamanho máximo recomendado para strings de UI que aparecem em botões/labels
// Baseado em guidelines do Chrome Web Store e práticas de i18n para garantir
// que textos não sejam cortados em interfaces de diferentes idiomas
const MAX_UI_LENGTH = 150; // caracteres

function validateLength(key, message, locale) {
  if (message.length > MAX_UI_LENGTH && (key.includes('_label') || key.includes('_title') || key.includes('_button'))) {
    return `⚠️  Long UI string in ${locale}:${key} (${message.length} chars, max recommended: ${MAX_UI_LENGTH})`;
  }
  return null;
}

async function main() {
  const defaultMessages = flattenMessages(await loadMessages(DEFAULT_LOCALE.folder));
  const defaultKeys = new Set(Object.keys(defaultMessages));
  const report = [];
  const allIssues = [];

  for (const locale of SUPPORTED) {
    const raw = flattenMessages(await loadMessages(locale.folder));
    const missing = [];
    const extra = [];
    const placeholderIssues = [];
    const lengthWarnings = [];

    defaultKeys.forEach((key) => {
      if (!(key in raw)) {
        missing.push(key);
      } else {
        const phIssues = validatePlaceholders(key, defaultMessages[key], raw[key], locale.code);
        placeholderIssues.push(...phIssues);

        const lengthIssue = validateLength(key, raw[key], locale.code);
        if (lengthIssue) lengthWarnings.push(lengthIssue);
      }
    });

    Object.keys(raw).forEach((key) => {
      if (!defaultKeys.has(key)) extra.push(key);
    });

    report.push({
      locale: locale.code,
      missingCount: missing.length,
      extraCount: extra.length,
      placeholderIssues: placeholderIssues.length,
      lengthWarnings: lengthWarnings.length,
      missing,
      extra,
    });

    allIssues.push(...placeholderIssues, ...lengthWarnings);
  }

  const lines = report
    .map((entry) => {
      const header = `${entry.locale}: ${entry.missingCount} missing, ${entry.extraCount} extra, ${entry.placeholderIssues} placeholder issues, ${entry.lengthWarnings} length warnings`;
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

  if (allIssues.length > 0) {
    console.log('\n⚠️  Validation Issues:');
    allIssues.slice(0, 20).forEach((issue) => console.log(`  ${issue}`));
    if (allIssues.length > 20) {
      console.log(`  ... and ${allIssues.length - 20} more issues`);
    }
  }

  const hasErrors = report.some((r) => r.missingCount > 0 || r.placeholderIssues > 0);
  if (hasErrors) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[i18n] Failed to check missing keys:', error);
  process.exitCode = 1;
});
