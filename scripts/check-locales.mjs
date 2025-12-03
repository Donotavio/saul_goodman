import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const LOCALES = ['en_US', 'pt_BR', 'es_419'];
const BASE_LOCALE = 'en_US';
const localeDir = '_locales';

async function loadMessages(locale) {
  const file = join(localeDir, locale, 'messages.json');
  const content = await readFile(file, 'utf8');
  const data = JSON.parse(content);
  return data;
}

function collectKeys(messages) {
  return Object.keys(messages).filter((key) => key && typeof messages[key] === 'object');
}

function compareKeys(baseKeys, localeKeys) {
  const missing = [];
  const extra = [];
  for (const key of baseKeys) {
    if (!localeKeys.includes(key)) {
      missing.push(key);
    }
  }
  for (const key of localeKeys) {
    if (!baseKeys.includes(key)) {
      extra.push(key);
    }
  }
  return { missing, extra };
}

(async () => {
  const baseMessages = await loadMessages(BASE_LOCALE);
  const baseKeys = collectKeys(baseMessages);
  let hasIssues = false;

  for (const locale of LOCALES) {
    const messages = await loadMessages(locale);
    const keys = collectKeys(messages);
    const { missing } = compareKeys(baseKeys, keys);

    const emptyValues = keys.filter((key) => {
      const entry = messages[key];
      return !entry || typeof entry.message !== 'string' || entry.message.trim() === '';
    });

    if (missing.length || emptyValues.length) {
      hasIssues = true;
      console.error(`Locale ${locale} has issues:`);
      if (missing.length) {
        console.error(`  Missing keys: ${missing.join(', ')}`);
      }
      if (emptyValues.length) {
        console.error(`  Empty translations: ${emptyValues.join(', ')}`);
      }
    }
  }

  if (hasIssues) {
    process.exit(1);
  } else {
    console.log('All locale files have the required keys.');
  }
})();
