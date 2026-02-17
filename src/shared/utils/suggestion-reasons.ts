import type { I18nService } from '../i18n.js';

type TranslatorFn = (key: string, substitutions?: Record<string, string | number>) => string;
type SuggestionDirection = 'productive' | 'procrastination';

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
    keywords: 'suggestion_reason_source_keywords',
    heading: 'suggestion_reason_source_headings',
    headings: 'suggestion_reason_source_headings',
    cabeçalhos: 'suggestion_reason_source_headings',
    cabecalhos: 'suggestion_reason_source_headings',
    headingsh1h3: 'suggestion_reason_source_headings'
  };

  const key = mapping[normalized];
  return key ? translate(key) : raw;
}

function decodeHtmlEntities(value: string): string {
  return value.replace(/&(?:quot|apos|amp|lt|gt);?|&#(?:\d+|x[0-9a-fA-F]+);?/g, (match) => {
    switch (match) {
      case '&quot;':
      case '&quot':
      case '&#34;':
      case '&#34':
      case '&#x22;':
      case '&#x22':
        return '"';
      case '&apos;':
      case '&apos':
      case '&#39;':
      case '&#39':
      case '&#x27;':
      case '&#x27':
        return "'";
      case '&amp;':
      case '&amp':
        return '&';
      case '&lt;':
      case '&lt':
        return '<';
      case '&gt;':
      case '&gt':
        return '>';
      default:
        if (match.startsWith('&#x')) {
          const raw = match.slice(3);
          const code = Number.parseInt(raw.endsWith(';') ? raw.slice(0, -1) : raw, 16);
          return Number.isFinite(code) ? String.fromCodePoint(code) : match;
        }
        if (match.startsWith('&#')) {
          const raw = match.slice(2);
          const code = Number.parseInt(raw.endsWith(';') ? raw.slice(0, -1) : raw, 10);
          return Number.isFinite(code) ? String.fromCodePoint(code) : match;
        }
        return match;
    }
  });
}

function resolveDirection(raw: string): SuggestionDirection | null {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) {
    return null;
  }
  if (normalized.includes('procrast')) {
    return 'procrastination';
  }
  if (normalized.includes('produtiv') || normalized.includes('productive')) {
    return 'productive';
  }
  return null;
}

function resolveDirectionLabel(raw: string, translate: TranslatorFn): string {
  const direction = resolveDirection(raw);
  if (direction === 'productive') {
    return translate('suggestion_reason_direction_productive');
  }
  if (direction === 'procrastination') {
    return translate('suggestion_reason_direction_procrastination');
  }
  return raw.trim();
}

function resolveImpactKey(weight: number): string {
  const value = Math.abs(weight);
  if (value < 0.35) {
    return 'suggestion_reason_impact_light';
  }
  if (value < 0.95) {
    return 'suggestion_reason_impact_medium';
  }
  return 'suggestion_reason_impact_strong';
}

function formatMlDetail(rawValue: string, translate: TranslatorFn): string {
  const value = rawValue.trim();
  if (!value) {
    return '';
  }
  const normalized = value.replace(/_/g, ' ');
  return translate('suggestion_reason_ml_detail', { value: normalized });
}

function resolveMlFamily(feature: string, translate: TranslatorFn): { family: string; detail: string } {
  const normalized = feature.trim();
  if (!normalized) {
    return {
      family: translate('suggestion_reason_ml_family_unknown'),
      detail: ''
    };
  }

  const separator = normalized.indexOf(':');
  if (separator === -1) {
    return {
      family: translate('suggestion_reason_ml_family_unknown'),
      detail: formatMlDetail(normalized, translate)
    };
  }

  const prefix = normalized.slice(0, separator).toLowerCase();
  const value = normalized.slice(separator + 1);
  switch (prefix) {
    case 'host':
      return { family: translate('suggestion_reason_ml_family_host'), detail: formatMlDetail(value, translate) };
    case 'root':
      return { family: translate('suggestion_reason_ml_family_root'), detail: formatMlDetail(value, translate) };
    case 'tld':
      return { family: translate('suggestion_reason_ml_family_tld'), detail: formatMlDetail(value, translate) };
    case 'lang':
      return {
        family: translate('suggestion_reason_ml_family_language'),
        detail: formatMlDetail(value.toUpperCase(), translate)
      };
    case 'og':
      return { family: translate('suggestion_reason_ml_family_og'), detail: formatMlDetail(value, translate) };
    case 'schema':
      return { family: translate('suggestion_reason_ml_family_schema'), detail: formatMlDetail(value, translate) };
    case 'path':
      return { family: translate('suggestion_reason_ml_family_path'), detail: formatMlDetail(value, translate) };
    case 'title':
      return { family: translate('suggestion_reason_ml_family_title'), detail: formatMlDetail(value, translate) };
    case 'desc':
      return {
        family: translate('suggestion_reason_ml_family_description'),
        detail: formatMlDetail(value, translate)
      };
    case 'heading':
      return {
        family: translate('suggestion_reason_ml_family_heading'),
        detail: formatMlDetail(value, translate)
      };
    case 'kw':
      return {
        family: translate('suggestion_reason_ml_family_keyword'),
        detail: formatMlDetail(value, translate)
      };
    case 'flag': {
      const flag = value.trim().toLowerCase();
      if (flag === 'video') {
        return { family: translate('suggestion_reason_ml_family_video'), detail: '' };
      }
      if (flag === 'scroll') {
        return { family: translate('suggestion_reason_ml_family_scroll'), detail: '' };
      }
      if (flag === 'autoplay') {
        return { family: translate('suggestion_reason_ml_family_autoplay'), detail: '' };
      }
      if (flag === 'feed') {
        return { family: translate('suggestion_reason_ml_family_feed'), detail: '' };
      }
      if (flag === 'form') {
        return { family: translate('suggestion_reason_ml_family_form'), detail: '' };
      }
      if (flag === 'editor') {
        return { family: translate('suggestion_reason_ml_family_editor'), detail: '' };
      }
      if (flag === 'table') {
        return { family: translate('suggestion_reason_ml_family_table'), detail: '' };
      }
      if (flag === 'shorts') {
        return { family: translate('suggestion_reason_ml_family_shorts'), detail: '' };
      }
      return {
        family: translate('suggestion_reason_ml_family_unknown'),
        detail: formatMlDetail(normalized, translate)
      };
    }
    case 'type':
      return {
        family: translate('suggestion_reason_ml_family_page_type'),
        detail: formatMlDetail(value, translate)
      };
    case 'heading_count':
      return {
        family: translate('suggestion_reason_ml_family_heading_count'),
        detail: formatMlDetail(value, translate)
      };
    case 'external_links':
      return {
        family: translate('suggestion_reason_ml_family_external_links'),
        detail: formatMlDetail(value, translate)
      };
    case 'active_ms':
      return {
        family: translate('suggestion_reason_ml_family_active_time'),
        detail: formatMlDetail(value, translate)
      };
    case 'scroll_depth':
      return {
        family: translate('suggestion_reason_ml_family_scroll_depth'),
        detail: formatMlDetail(value, translate)
      };
    case 'interaction_count':
      return {
        family: translate('suggestion_reason_ml_family_interactions'),
        detail: formatMlDetail(value, translate)
      };
    default:
      return {
        family: translate('suggestion_reason_ml_family_unknown'),
        detail: formatMlDetail(normalized, translate)
      };
  }
}

export function translateSuggestionReason(
  reason: string,
  translator?: I18nService | TranslatorFn | null
): string {
  const translate = normalizeTranslator(translator);
  const normalizedReason = decodeHtmlEntities(reason).replace(/\s+/g, ' ').trim();
  const mlSignalMatch = normalizedReason.match(
    /^Sinal:\s*(.+?)\s+favorece\s+(.+?)(?:\s+\(peso\s+([0-9.,]+)\))?\.?\s*$/i
  );
  if (mlSignalMatch) {
    const feature = mlSignalMatch[1] ?? '';
    const direction = resolveDirectionLabel(mlSignalMatch[2] ?? '', translate);
    const rawWeight = (mlSignalMatch[3] ?? '0').replace(',', '.');
    const weight = Number.parseFloat(rawWeight);
    const impact = translate(resolveImpactKey(Number.isFinite(weight) ? weight : 0));
    const parsedFeature = resolveMlFamily(feature, translate);
    return translate('suggestion_reason_ml_signal', {
      family: parsedFeature.family,
      detail: parsedFeature.detail,
      direction,
      impact
    });
  }

  const learnedGenericMatch = normalizedReason.match(
    /^Sinal aprendido:\s*(.+?)\s+(?:tende a ser|indica)\s+(.+)\s*$/i
  );
  if (learnedGenericMatch) {
    const subject = learnedGenericMatch[1]?.trim() ?? '';
    const direction = resolveDirectionLabel(learnedGenericMatch[2] ?? '', translate);
    return translate('suggestion_reason_learned_generic', {
      subject,
      direction
    });
  }

  const learnedFallbackMatch = normalizedReason.match(/^Sinal aprendido favorece\s+(.+)\s*$/i);
  if (learnedFallbackMatch) {
    const direction = resolveDirectionLabel(learnedFallbackMatch[1] ?? '', translate);
    return translate('suggestion_reason_learned_fallback', { direction });
  }

  const knownHostMatch = normalizedReason.match(/^(?:Host conhecido|Dom[ií]nio conhecido):\s*(.+)$/i);
  if (knownHostMatch) {
    const host = knownHostMatch[1];
    return translate('suggestion_reason_known_host', { host });
  }

  const keywordMatch = normalizedReason.match(/^(?:Palavra-chave|Keyword)\s+"(.+)"\s+(?:em|in)\s+(.+)$/i);
  if (keywordMatch) {
    const keyword = keywordMatch[1];
    const source = resolveSourceLabel(keywordMatch[2], translate);
    return translate('suggestion_reason_keyword', { keyword, source });
  }

  const videoMatch = normalizedReason.match(/(?:Player de v[íi]deo detectado|Video player detected)/i);
  if (videoMatch) {
    return translate('suggestion_reason_video');
  }

  const scrollMatch = normalizedReason.match(/(?:Scroll infinito detectado|Infinite scroll detected)/i);
  if (scrollMatch) {
    return translate('suggestion_reason_infinite_scroll');
  }

  const ogMatch = normalizedReason.match(
    /^(?:og:type\s*=\s*|(?:Tipo de p[aá]gina|Page type)\s*:\s*)(.+)$/i
  );
  if (ogMatch) {
    return translate('suggestion_reason_og_type', { type: ogMatch[1] });
  }

  const pathMatch = normalizedReason.match(/^(?:Caminho cont[eé]m|Path contains)\s+["“]?(.+?)["”]?\s*$/i);
  if (pathMatch) {
    return translate('suggestion_reason_path', { path: pathMatch[1] });
  }

  const schemaMatch = normalizedReason.match(/^schema:\s*(.+)\s*$/i);
  if (schemaMatch) {
    return translate('suggestion_reason_schema', { schema: schemaMatch[1] });
  }

  if (/(?:M[íi]dia em autoplay detectada|Autoplay media detected)/i.test(normalizedReason)) {
    return translate('suggestion_reason_autoplay');
  }

  if (/(?:Layout de feed detectado|Feed layout detected)/i.test(normalizedReason)) {
    return translate('suggestion_reason_feed');
  }

  if (/(?:Padr[aã]o de shorts\/reels detectado|Shorts\/reels pattern detected)/i.test(normalizedReason)) {
    return translate('suggestion_reason_shorts');
  }

  if (/(?:Formul[aá]rio interativo detectado|Interactive form detected)/i.test(normalizedReason)) {
    return translate('suggestion_reason_form');
  }

  if (/(?:Editor de texto\/c[oó]digo detectado|Rich text\/code editor detected)/i.test(normalizedReason)) {
    return translate('suggestion_reason_editor');
  }

  if (/(?:Tabela extensa detectada|Large table detected)/i.test(normalizedReason)) {
    return translate('suggestion_reason_table');
  }

  return normalizedReason;
}

export function sanitizeReasonText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
