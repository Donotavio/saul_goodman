import type { I18nService } from '../i18n.js';

type TranslatorFn = (key: string, substitutions?: Record<string, string | number>) => string;

const FALLBACK_TRANSLATOR: TranslatorFn = (key, substitutions) => {
  if (!substitutions) {
    return key;
  }
  return Object.entries(substitutions).reduce((acc, [token, value]) => {
    return acc.replace(new RegExp(`\\{${token}\\}`, 'g'), String(value));
  }, key);
};

function normalizeTranslator(source?: I18nService | TranslatorFn | null): TranslatorFn {
  if (!source) {
    return FALLBACK_TRANSLATOR;
  }
  if (typeof source === 'function') {
    return source;
  }
  return (key: string, substitutions?: Record<string, string | number>) =>
    source.t(key, substitutions);
}

function resolveSourceLabel(raw: string, translate: TranslatorFn): string {
  const normalized = raw.trim().toLowerCase();
  const mapping: Record<string, string> = {
    hostname: 'suggestion_reason_source_hostname',
    dominio: 'suggestion_reason_source_hostname',
    domain: 'suggestion_reason_source_hostname',
    domínio: 'suggestion_reason_source_hostname',
    titulo: 'suggestion_reason_source_title',
    título: 'suggestion_reason_source_title',
    title: 'suggestion_reason_source_title',
    descricao: 'suggestion_reason_source_description',
    descrição: 'suggestion_reason_source_description',
    description: 'suggestion_reason_source_description',
    keywords: 'suggestion_reason_source_keywords'
  };

  const key = mapping[normalized];
  return key ? translate(key) : raw;
}

export function translateSuggestionReason(
  reason: string,
  translator?: I18nService | TranslatorFn | null
): string {
  const translate = normalizeTranslator(translator);
  const knownHostMatch = reason.match(/^Host conhecido:\s*(.+)$/i);
  if (knownHostMatch) {
    const host = knownHostMatch[1];
    return translate('suggestion_reason_known_host', { host });
  }

  const keywordMatch = reason.match(/^Palavra-chave\s+"(.+)"\s+em\s+(.+)$/i);
  if (keywordMatch) {
    const keyword = keywordMatch[1];
    const source = resolveSourceLabel(keywordMatch[2], translate);
    return translate('suggestion_reason_keyword', { keyword, source });
  }

  const videoMatch = reason.match(/Player de v[íi]deo detectado/i);
  if (videoMatch) {
    return translate('suggestion_reason_video');
  }

  const scrollMatch = reason.match(/Scroll infinito detectado/i);
  if (scrollMatch) {
    return translate('suggestion_reason_infinite_scroll');
  }

  const ogMatch = reason.match(/^og:type\s*=\s*(.+)$/i);
  if (ogMatch) {
    return translate('suggestion_reason_og_type', { type: ogMatch[1] });
  }

  return reason;
}

export function sanitizeReasonText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
