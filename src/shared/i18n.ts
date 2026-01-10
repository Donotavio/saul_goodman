import type { LocalePreference, SupportedLocale } from './types.js';

export const SUPPORTED_LOCALES: SupportedLocale[] = [
  'pt-BR',
  'en-US',
  'es-419',
  'fr',
  'de',
  'it',
  'tr',
  'zh-CN',
  'hi',
  'ar',
  'bn',
  'ru',
  'ur'
];
const DEFAULT_LOCALE: SupportedLocale = 'en-US';

const RTL_LOCALES: Set<SupportedLocale> = new Set(['ar', 'ur']);

export function localeToDir(locale: SupportedLocale): string {
  return locale.replace(/-/g, '_');
}

const localeCache = new Map<SupportedLocale, Record<string, string>>();

export interface I18nService {
  locale: SupportedLocale;
  preference: LocalePreference;
  t: (
    key: string,
    substitutions?: Array<string | number> | Record<string, string | number>
  ) => string;
  apply: (root?: Document | HTMLElement) => void;
}

export function resolveLocale(preference?: LocalePreference): SupportedLocale {
  if (preference && preference !== 'auto' && SUPPORTED_LOCALES.includes(preference)) {
    return preference;
  }

  const browserLocale = (chrome?.i18n?.getUILanguage?.() ?? navigator.language ?? '').toLowerCase();
  const normalized = browserLocale.split('-')[0];

  const mapping: Record<string, SupportedLocale> = {
    pt: 'pt-BR',
    es: 'es-419',
    en: 'en-US',
    fr: 'fr',
    de: 'de',
    it: 'it',
    tr: 'tr',
    zh: 'zh-CN',
    hi: 'hi',
    ar: 'ar',
    bn: 'bn',
    ru: 'ru',
    ur: 'ur'
  };

  if (mapping[normalized]) {
    return mapping[normalized];
  }

  return 'en-US';
}

export async function createI18n(preference?: LocalePreference): Promise<I18nService> {
  const locale = resolveLocale(preference);
  const [messages, fallbackMessages] = await Promise.all([
    loadMessages(locale),
    locale === DEFAULT_LOCALE ? loadMessages(locale) : loadMessages(DEFAULT_LOCALE)
  ]);

  return new I18nImpl(locale, preference ?? 'auto', messages, fallbackMessages);
}

class I18nImpl implements I18nService {
  public locale: SupportedLocale;
  public preference: LocalePreference;
  private messages: Record<string, string>;
  private fallback: Record<string, string>;

  constructor(
    locale: SupportedLocale,
    preference: LocalePreference,
    messages: Record<string, string>,
    fallback: Record<string, string>
  ) {
    this.locale = locale;
    this.preference = preference;
    this.messages = messages;
    this.fallback = fallback;
  }

  public t(
    key: string,
    substitutions?: Array<string | number> | Record<string, string | number>
  ): string {
    const template = this.messages[key] ?? this.fallback[key] ?? key;
    return applySubstitutions(template, substitutions);
  }

  public apply(root?: Document | HTMLElement): void {
    const target: Document | HTMLElement = root ?? document;
    const doc =
      target instanceof Document ? target : target.ownerDocument ?? document;
    doc.documentElement.lang = this.locale;
    doc.documentElement.dir = RTL_LOCALES.has(this.locale) ? 'rtl' : 'ltr';

    const elements = target.querySelectorAll<HTMLElement>('[data-i18n]');
    elements.forEach((element) => {
      const key = element.dataset.i18n;
      if (key) {
        element.textContent = this.t(key);
      }
    });

    applyDataset(target, this, 'i18nHtml', (el, key, i18n) => {
      el.innerHTML = i18n.t(key);
    });
    applyDataset(target, this, 'i18nPlaceholder', (el, key, i18n) => {
      (el as HTMLElement).setAttribute('placeholder', i18n.t(key));
    });
    applyDataset(target, this, 'i18nTitle', (el, key, i18n) => {
      (el as HTMLElement).setAttribute('title', i18n.t(key));
    });
    applyDataset(target, this, 'i18nAriaLabel', (el, key, i18n) => {
      (el as HTMLElement).setAttribute('aria-label', i18n.t(key));
    });
    applyDataset(target, this, 'i18nTooltip', (el, key, i18n) => {
      (el as HTMLElement).setAttribute('data-tooltip', i18n.t(key));
    });
  }
}

function applyDataset(
  root: Document | HTMLElement,
  i18n: I18nImpl,
  attr: 'i18nHtml' | 'i18nPlaceholder' | 'i18nTitle' | 'i18nAriaLabel' | 'i18nTooltip',
  setter: (el: HTMLElement, key: string, i18n: I18nImpl) => void
): void {
  const selector = `[data-${attr.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}]`;
  const nodes =
    root instanceof Document
      ? root.querySelectorAll<HTMLElement>(selector)
      : root.querySelectorAll<HTMLElement>(selector);
  nodes.forEach((element) => {
    const dataKey = element.dataset[attr as keyof typeof element.dataset] as string | undefined;
    if (dataKey) {
      setter(element, dataKey, i18n);
    }
  });
}

function applySubstitutions(
  template: string,
  substitutions?: Array<string | number> | Record<string, string | number>
): string {
  if (!substitutions) {
    return template;
  }
  if (Array.isArray(substitutions)) {
    return template.replace(/\$(\d+)/g, (_match, index) => {
      const value = substitutions[Number.parseInt(index, 10) - 1];
      return typeof value === 'undefined' ? '' : String(value);
    });
  }
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    if (Object.prototype.hasOwnProperty.call(substitutions, key)) {
      return String(substitutions[key]);
    }
    return match;
  });
}

async function loadMessages(locale: SupportedLocale): Promise<Record<string, string>> {
  if (localeCache.has(locale)) {
    return localeCache.get(locale) as Record<string, string>;
  }

  const url = chrome.runtime.getURL(`_locales/${localeToDir(locale)}/messages.json`);
  const response = await fetch(url);
  if (!response.ok) {
    if (locale === DEFAULT_LOCALE) {
      throw new Error(`Failed to load messages for locale: ${locale}`);
    }
    return loadMessages(DEFAULT_LOCALE);
  }
  const raw = (await response.json()) as Record<string, { message: string }>;
  const messages: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    messages[key] = value.message ?? '';
  }
  localeCache.set(locale, messages);
  return messages;
}
