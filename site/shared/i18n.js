/**
 * Shared i18n module for site and blog.
 * Consolidates locale loading, message flattening, and translation functions.
 */

export const DEFAULT_LANGUAGE = 'pt';

export const SUPPORTED_LANGUAGES = [
  'pt',
  'en',
  'es',
  'fr',
  'de',
  'it',
  'tr',
  'zh',
  'hi',
  'ar',
  'bn',
  'ru',
  'ur',
];

export const LOCALE_DIR_BY_LANGUAGE = {
  pt: 'pt_BR',
  en: 'en_US',
  es: 'es_419',
  fr: 'fr',
  de: 'de',
  it: 'it',
  tr: 'tr',
  zh: 'zh_CN',
  hi: 'hi',
  ar: 'ar',
  bn: 'bn',
  ru: 'ru',
  ur: 'ur',
};

export const RTL_LANGUAGES = new Set(['ar', 'ur']);

const localeMessagesCache = {};

/**
 * Flattens Chrome-style messages.json format to simple key-value pairs.
 * @param {Object} raw - Chrome messages.json object
 * @returns {Object} Flattened messages
 */
export function flattenChromeMessages(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object') return result;
  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value.message === 'string') {
      result[key] = value.message;
    }
  }
  return result;
}

/**
 * Loads messages for a given language from multiple possible base paths.
 * @param {string} lang - Language code (e.g., 'pt', 'en')
 * @param {URL[]} bases - Array of base URLs to try
 * @returns {Promise<Object>} Flattened messages object
 */
export async function loadMessagesForLanguage(lang, bases) {
  const normalized = SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
  if (localeMessagesCache[normalized]) {
    return localeMessagesCache[normalized];
  }

  const dir = LOCALE_DIR_BY_LANGUAGE[normalized] || LOCALE_DIR_BY_LANGUAGE[DEFAULT_LANGUAGE];

  let lastError;
  for (const base of bases) {
    try {
      const url = new URL(dir + '/messages.json', base);
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} ao carregar ${url.toString()}`);
        continue;
      }
      const raw = await response.json();
      const flat = flattenChromeMessages(raw);
      localeMessagesCache[normalized] = flat;
      return flat;
    } catch (error) {
      lastError = error;
    }
  }

  const hint = 'Locales não encontrados. Rode `npm run i18n:copy-site` e sirva a pasta site/.';
  throw new Error(`${hint} (${lastError?.message || 'erro desconhecido'})`);
}

/**
 * Creates a translator function with fallback support.
 * @param {Object} messages - Primary messages object
 * @param {Object} fallback - Fallback messages object
 * @returns {Function} Translator function t(key)
 */
export function createTranslator(messages, fallback) {
  return (key) => messages[key] || fallback[key] || key;
}

/**
 * Creates an i18n context with language setting and message loading.
 * @param {URL[]} localesBases - Base URLs for locale files
 * @returns {Object} i18n context with currentLanguage, messages, and setLanguage function
 */
export function createI18nContext(localesBases) {
  let currentLanguage = DEFAULT_LANGUAGE;
  let currentMessages = {};
  let fallbackMessages = {};

  const setLanguage = async (lang) => {
    const normalized = SUPPORTED_LANGUAGES.includes(lang) ? lang : DEFAULT_LANGUAGE;
    currentLanguage = normalized;
    try {
      currentMessages = await loadMessagesForLanguage(currentLanguage, localesBases);
    } catch (error) {
      console.warn(`[i18n] Failed to load messages for ${currentLanguage}:`, error);
      currentMessages = {};
    }
    try {
      fallbackMessages = await loadMessagesForLanguage(DEFAULT_LANGUAGE, localesBases);
    } catch (error) {
      console.warn(`[i18n] Failed to load fallback messages:`, error);
      fallbackMessages = {};
    }
  };

  const t = (key) => currentMessages[key] || fallbackMessages[key] || key;

  return {
    get currentLanguage() { return currentLanguage; },
    get currentMessages() { return currentMessages; },
    get fallbackMessages() { return fallbackMessages; },
    setLanguage,
    t
  };
}
