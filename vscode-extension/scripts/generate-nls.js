#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VSCODE_ROOT = path.resolve(__dirname, '..');
const LOCALES_DIR = path.join(VSCODE_ROOT, '_locales');

const VSCODE_KEYS = [
  'vscode_ext_display_name',
  'vscode_ext_description',
  'command_start_daemon',
  'command_test_daemon',
  'command_open_reports',
  'config_enabled_description',
  'config_enable_tracking_description',
  'config_enable_reports_description',
  'config_enable_sensitive_telemetry_description',
  'config_api_base_description',
  'config_pairing_key_description',
  'config_hash_file_paths_description',
  'config_hash_project_names_description',
  'config_heartbeat_interval_description',
  'config_idle_threshold_description',
  'config_language_description',
  'config_enable_telemetry_description',
  'config_telemetry_diagnostics_interval_description',
  'config_telemetry_retention_description',
];

const LOCALE_MAP = {
  en_US: 'en',
  pt_BR: 'pt-BR',
  es_419: 'es-419',
  zh_CN: 'zh-CN',
};

async function extractVSCodeKeys(locale) {
  const messagesPath = path.join(LOCALES_DIR, locale, 'messages.json');
  try {
    const raw = await fs.readFile(messagesPath, 'utf-8');
    const messages = JSON.parse(raw);
    
    const extracted = {};
    for (const key of VSCODE_KEYS) {
      if (messages[key]?.message) {
        extracted[key] = messages[key].message;
      }
    }
    
    return extracted;
  } catch (error) {
    console.warn(`[generate-nls] Não foi possível ler ${locale}: ${error.message}`);
    return null;
  }
}

async function generateNLSFiles() {
  const locales = await fs.readdir(LOCALES_DIR);
  
  for (const locale of locales) {
    const stat = await fs.stat(path.join(LOCALES_DIR, locale));
    if (!stat.isDirectory()) continue;
    
    const extracted = await extractVSCodeKeys(locale);
    if (!extracted || Object.keys(extracted).length === 0) {
      console.log(`[generate-nls] Pulando ${locale} - sem chaves VS Code`);
      continue;
    }
    
    const nlsLocale = LOCALE_MAP[locale] || locale;
    const filename = locale === 'en_US' 
      ? 'package.nls.json'
      : `package.nls.${nlsLocale}.json`;
    
    const outputPath = path.join(VSCODE_ROOT, filename);
    await fs.writeFile(outputPath, JSON.stringify(extracted, null, 2) + '\n', 'utf-8');
    
    console.log(`[generate-nls] ✓ ${filename} (${Object.keys(extracted).length} chaves)`);
  }
}

generateNLSFiles().catch((err) => {
  console.error('[generate-nls] Erro:', err);
  process.exit(1);
});
