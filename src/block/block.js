import { resolveLocale, localeToDir } from '../../dist/shared/i18n.js';

const DEFAULT_LOCALE = 'en-US';
const SETTINGS_KEY = 'sg:settings';

document.addEventListener('DOMContentLoaded', () => {
  void initialize();
});

async function initialize() {
  let t = (key, fallback) => fallback ?? key;
  try {
    const i18n = await createBlockI18n();
    t = i18n.t;
    document.documentElement.lang = i18n.locale;
    applyTranslations(t);
  } catch (error) {
    console.warn('[block] Failed to load i18n, using fallback:', error);
    applyTranslations(t);
  }

  attachActions(t);
}

function applyTranslations(t) {
  document.title = t('block_page_title', document.title);

  const headingEl = document.getElementById('blockHeading');
  if (headingEl) {
    headingEl.textContent = t('block_page_heading', headingEl.textContent ?? '');
  }

  const bodyEl = document.getElementById('blockBody');
  if (bodyEl) {
    bodyEl.textContent = t('block_page_body', bodyEl.textContent ?? '');
  }

  const localNoteEl = document.getElementById('blockLocalNote');
  if (localNoteEl) {
    localNoteEl.textContent = t('block_page_local_note', localNoteEl.textContent ?? '');
  }

  const imageEl = document.getElementById('blockImage');
  if (imageEl) {
    imageEl.alt = t('block_page_image_alt', imageEl.alt ?? '');
  }
}

function attachActions(t) {
  const optionsBtn = document.getElementById('optionsButton');
  const backBtn = document.getElementById('backButton');

  if (backBtn) {
    backBtn.textContent = t('block_page_back', backBtn.textContent ?? '');
  }

  if (optionsBtn) {
    optionsBtn.textContent = t('block_page_options', optionsBtn.textContent ?? '');
  }

  optionsBtn?.addEventListener('click', () => {
    const url = chrome.runtime.getURL('src/options/options.html#vilains');
    if (chrome?.tabs?.create) {
      chrome.tabs.create({ url }).catch(() => {
        window.location.href = url;
      });
    } else {
      window.location.href = url;
    }
  });

  backBtn?.addEventListener('click', () => {
    if (history.length > 1) {
      history.back();
      return;
    }

    if (chrome?.tabs?.getCurrent && chrome?.tabs?.remove) {
      chrome.tabs.getCurrent((tab) => {
        if (chrome.runtime.lastError || !tab?.id) {
          window.close();
          return;
        }
        chrome.tabs.remove(tab.id, () => window.close());
      });
      return;
    }

    window.close();
  });
}

async function createBlockI18n() {
  const { preference } = await loadLocalePreference();
  const locale = resolveLocale(preference);
  const messages = await loadMessages(locale);
  const fallback = locale === DEFAULT_LOCALE ? messages : await loadMessages(DEFAULT_LOCALE);

  const translate = (key, fallbackText) =>
    messages[key] ?? fallback[key] ?? fallbackText ?? key;

  return {
    locale,
    t: translate
  };
}

async function loadLocalePreference() {
  try {
    const stored = (await chrome.storage.local.get(SETTINGS_KEY))[SETTINGS_KEY];
    return {
      preference: stored?.localePreference ?? 'auto'
    };
  } catch {
    return { preference: 'auto' };
  }
}

async function loadMessages(locale) {
  const dir = localeToDir(locale);
  try {
    const response = await fetch(chrome.runtime.getURL(`_locales/${dir}/messages.json`));
    if (!response.ok) {
      throw new Error('Failed to load locale file');
    }
    const raw = await response.json();
    const messages = {};
    for (const [key, value] of Object.entries(raw)) {
      messages[key] = value?.message ?? '';
    }
    return messages;
  } catch {
    if (locale !== DEFAULT_LOCALE) {
      return loadMessages(DEFAULT_LOCALE);
    }
    return {};
  }
}
