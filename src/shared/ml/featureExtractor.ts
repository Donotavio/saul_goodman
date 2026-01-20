import { normalizeDomain } from '../utils/domain.js';

export interface FeatureExtractionInput {
  hostname: string;
  title?: string;
  description?: string;
  keywords?: string[];
  headings?: string[];
  ogType?: string;
  schemaTypes?: string[];
  pathTokens?: string[];
  language?: string;
  hasVideoPlayer?: boolean;
  hasInfiniteScroll?: boolean;
  hasAutoplayMedia?: boolean;
  hasFeedLayout?: boolean;
  hasFormFields?: boolean;
  hasRichEditor?: boolean;
  hasLargeTable?: boolean;
  hasShortsPattern?: boolean;
  externalLinksCount?: number;
  activeMs?: number;
  scrollDepth?: number;
  interactionCount?: number;
}

export interface FeatureExtractorConfig {
  minTokenLength?: number;
  maxTokenLength?: number;
  maxTokensPerField?: number;
  includeBigrams?: boolean;
  stopwords?: Set<string>;
}

export type FeatureMap = Record<string, number>;

const DEFAULT_STOPWORDS = new Set([
  'a',
  'about',
  'above',
  'after',
  'again',
  'against',
  'all',
  'also',
  'am',
  'an',
  'and',
  'any',
  'are',
  'as',
  'at',
  'be',
  'because',
  'been',
  'before',
  'being',
  'below',
  'between',
  'both',
  'but',
  'by',
  'can',
  'could',
  'did',
  'do',
  'does',
  'doing',
  'down',
  'during',
  'each',
  'few',
  'for',
  'from',
  'further',
  'had',
  'has',
  'have',
  'having',
  'he',
  'her',
  'here',
  'hers',
  'herself',
  'him',
  'himself',
  'his',
  'how',
  'i',
  'if',
  'in',
  'into',
  'is',
  'it',
  'its',
  'itself',
  'just',
  'me',
  'more',
  'most',
  'my',
  'myself',
  'no',
  'nor',
  'not',
  'now',
  'of',
  'off',
  'on',
  'once',
  'only',
  'or',
  'other',
  'our',
  'ours',
  'ourselves',
  'out',
  'over',
  'own',
  'same',
  'she',
  'should',
  'so',
  'some',
  'such',
  'than',
  'that',
  'the',
  'their',
  'theirs',
  'them',
  'themselves',
  'then',
  'there',
  'these',
  'they',
  'this',
  'those',
  'through',
  'to',
  'too',
  'under',
  'until',
  'up',
  'very',
  'was',
  'we',
  'were',
  'what',
  'when',
  'where',
  'which',
  'while',
  'who',
  'whom',
  'why',
  'with',
  'would',
  'you',
  'your',
  'yours',
  'yourself',
  'yourselves',
  'ainda',
  'alguem',
  'algum',
  'alguma',
  'algumas',
  'alguns',
  'ampla',
  'amplas',
  'amplo',
  'amplos',
  'ante',
  'antes',
  'ao',
  'aos',
  'apos',
  'aquela',
  'aquelas',
  'aquele',
  'aqueles',
  'aquilo',
  'as',
  'assim',
  'ate',
  'cada',
  'caminho',
  'cima',
  'com',
  'como',
  'contra',
  'contudo',
  'da',
  'das',
  'de',
  'dela',
  'dele',
  'deles',
  'demais',
  'dentro',
  'desde',
  'dessa',
  'desse',
  'desta',
  'deste',
  'deve',
  'devem',
  'devendo',
  'dever',
  'devera',
  'deverao',
  'deveria',
  'deveriam',
  'devia',
  'deviam',
  'disse',
  'disso',
  'disto',
  'dito',
  'diz',
  'dizem',
  'do',
  'dos',
  'e',
  'ela',
  'elas',
  'ele',
  'eles',
  'em',
  'enquanto',
  'entre',
  'era',
  'eram',
  'essa',
  'essas',
  'esse',
  'esses',
  'esta',
  'estamos',
  'estao',
  'estas',
  'estava',
  'estavam',
  'este',
  'estes',
  'estou',
  'eu',
  'faz',
  'fazeis',
  'fazem',
  'fazemos',
  'fazendo',
  'fazer',
  'fazes',
  'feita',
  'feitas',
  'feito',
  'feitos',
  'foi',
  'for',
  'fora',
  'foram',
  'forma',
  'fosse',
  'fossem',
  'fui',
  'geral',
  'grande',
  'grandes',
  'ha',
  'isso',
  'isto',
  'ja',
  'la',
  'lhe',
  'lhes',
  'mais',
  'mas',
  'me',
  'mesma',
  'mesmas',
  'mesmo',
  'mesmos',
  'meu',
  'meus',
  'minha',
  'minhas',
  'muito',
  'muitos',
  'na',
  'nao',
  'nas',
  'nem',
  'nenhum',
  'nessa',
  'nesse',
  'nesta',
  'neste',
  'no',
  'nos',
  'nossa',
  'nossas',
  'nosso',
  'nossos',
  'num',
  'numa',
  'o',
  'os',
  'ou',
  'outra',
  'outras',
  'outro',
  'outros',
  'para',
  'pela',
  'pelas',
  'pelo',
  'pelos',
  'per',
  'perante',
  'pode',
  'podem',
  'podendo',
  'poder',
  'poderia',
  'poderiam',
  'podia',
  'podiam',
  'pois',
  'por',
  'porque',
  'posso',
  'pouca',
  'poucas',
  'pouco',
  'poucos',
  'primeiro',
  'que',
  'quem',
  'se',
  'seja',
  'sejam',
  'sem',
  'sempre',
  'sendo',
  'sera',
  'serao',
  'seu',
  'seus',
  'si',
  'sido',
  'sob',
  'sobre',
  'sua',
  'suas',
  'tal',
  'tambem',
  'te',
  'tem',
  'tendo',
  'tenha',
  'ter',
  'teu',
  'teus',
  'toda',
  'todas',
  'todo',
  'todos',
  'tu',
  'tua',
  'tuas',
  'tudo',
  'ultima',
  'ultimo',
  'um',
  'uma',
  'umas',
  'uns',
  'vendo',
  'ver',
  'vez',
  'vindo',
  'vir',
  'vos',
  'vossa',
  'vossas',
  'vosso',
  'vossos',
  'aqui',
  'ali',
  'bem',
  'cada',
  'essa',
  'esse',
  'essa',
  'este',
  'esta',
  'isso',
  'isto',
  'nesse',
  'nessa',
  'neste',
  'nesta'
]);

const DEFAULT_CONFIG: Required<FeatureExtractorConfig> = {
  minTokenLength: 3,
  maxTokenLength: 32,
  maxTokensPerField: 40,
  includeBigrams: true,
  stopwords: DEFAULT_STOPWORDS
};

const MULTI_PART_TLDS = new Set([
  'com.br',
  'com.ar',
  'com.mx',
  'com.au',
  'co.uk',
  'co.jp',
  'co.kr',
  'co.in',
  'co.id',
  'co.za',
  'org.uk',
  'gov.br'
]);

/**
 * Extrai features categóricas e numéricas a partir de sinais da página.
 */
export class FeatureExtractor {
  private readonly config: Required<FeatureExtractorConfig>;

  constructor(config?: FeatureExtractorConfig) {
    this.config = { ...DEFAULT_CONFIG, ...(config ?? {}) };
    if (!this.config.stopwords) {
      this.config.stopwords = DEFAULT_STOPWORDS;
    }
  }

  /**
   * Converte sinais brutos em features normalizadas.
   *
   * @param input Informações da página e do comportamento.
   * @returns Mapa de features prontas para vetorização.
   */
  extract(input: FeatureExtractionInput): FeatureMap {
    const features: FeatureMap = {};
    const host = normalizeDomain(input.hostname ?? '');
    if (host) {
      addFeature(features, `host:${host}`);
      const rootHost = extractRootHost(host);
      if (rootHost && rootHost !== host) {
        addFeature(features, `root:${rootHost}`);
      }
      const tld = extractTld(host);
      if (tld) {
        addFeature(features, `tld:${tld}`);
      }
    }

    if (input.language) {
      const normalizedLang = normalizeLanguage(input.language);
      if (normalizedLang) {
        addFeature(features, `lang:${normalizedLang}`);
      }
    }

    if (input.ogType) {
      addFeature(features, `og:${input.ogType.toLowerCase()}`);
    }

    if (Array.isArray(input.schemaTypes)) {
      input.schemaTypes
        .map((schema) => schema.toLowerCase().trim())
        .filter(Boolean)
        .forEach((schema) => addFeature(features, `schema:${schema}`));
    }

    if (Array.isArray(input.pathTokens)) {
      input.pathTokens
        .map((token) => token.toLowerCase().trim())
        .filter(Boolean)
        .forEach((token) => addFeature(features, `path:${token}`));
    }

    addTextFeatures(features, 'title', input.title, this.config);
    addTextFeatures(features, 'desc', input.description, this.config);
    addListTextFeatures(features, 'heading', input.headings, this.config);
    addListTextFeatures(features, 'kw', input.keywords, this.config);

    if (input.hasVideoPlayer) {
      addFeature(features, 'flag:video');
    }
    if (input.hasInfiniteScroll) {
      addFeature(features, 'flag:scroll');
    }
    if (input.hasAutoplayMedia) {
      addFeature(features, 'flag:autoplay');
    }
    if (input.hasFeedLayout) {
      addFeature(features, 'flag:feed');
    }
    if (input.hasFormFields) {
      addFeature(features, 'flag:form');
    }
    if (input.hasRichEditor) {
      addFeature(features, 'flag:editor');
    }
    if (input.hasLargeTable) {
      addFeature(features, 'flag:table');
    }
    if (input.hasShortsPattern) {
      addFeature(features, 'flag:shorts');
    }

    const pageType = resolvePageType(input);
    if (pageType) {
      addFeature(features, `type:${pageType}`);
    }

    const headingCount = input.headings?.length ?? 0;
    addFeature(features, `heading_count:${bucketCount(headingCount, [0, 1, 3, 6, 10])}`);

    if (Number.isFinite(input.externalLinksCount)) {
      const linksCount = input.externalLinksCount ?? 0;
      addFeature(features, `external_links:${bucketCount(linksCount, [0, 3, 10, 25, 50])}`);
    }

    if (Number.isFinite(input.activeMs)) {
      addFeature(features, `active_ms:${bucketDuration(input.activeMs ?? 0)}`);
    }

    if (Number.isFinite(input.scrollDepth)) {
      const depth = clampNumber(input.scrollDepth ?? 0, 0, 1);
      addFeature(features, `scroll_depth:${bucketRatio(depth)}`);
    }

    if (Number.isFinite(input.interactionCount)) {
      addFeature(features, `interaction_count:${bucketCount(input.interactionCount ?? 0, [0, 1, 3, 5, 10])}`);
    }

    return features;
  }
}

function addFeature(features: FeatureMap, name: string, value = 1): void {
  if (!name) {
    return;
  }
  const normalized = name.trim();
  if (!normalized) {
    return;
  }
  const existing = features[normalized] ?? 0;
  const nextValue = existing + value;
  if (!Number.isFinite(nextValue)) {
    return;
  }
  features[normalized] = nextValue;
}

function addTextFeatures(
  features: FeatureMap,
  prefix: string,
  text: string | undefined,
  config: Required<FeatureExtractorConfig>
): void {
  if (!text) {
    return;
  }
  const tokens = tokenize(text, config);
  tokens.forEach((token) => addFeature(features, `${prefix}:${token}`));
}

function addListTextFeatures(
  features: FeatureMap,
  prefix: string,
  list: string[] | undefined,
  config: Required<FeatureExtractorConfig>
): void {
  if (!Array.isArray(list)) {
    return;
  }
  const allTokens = list.flatMap((entry) => tokenize(entry, config));
  allTokens.forEach((token) => addFeature(features, `${prefix}:${token}`));
}

function tokenize(text: string, config: Required<FeatureExtractorConfig>): string[] {
  const raw = text
    .toLowerCase()
    .split(/[^a-z0-9á-úà-ùãõâêîôûç]+/gi)
    .map((token) => token.trim())
    .filter(Boolean)
    .filter(
      (token) =>
        token.length >= config.minTokenLength &&
        token.length <= config.maxTokenLength &&
        !config.stopwords.has(token)
    );

  const tokens = raw.slice(0, config.maxTokensPerField);
  if (!config.includeBigrams || tokens.length < 2) {
    return tokens;
  }

  const bigrams = [] as string[];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    const bigram = `${tokens[i]}_${tokens[i + 1]}`;
    if (bigram.length <= config.maxTokenLength * 2) {
      bigrams.push(bigram);
    }
  }
  return [...tokens, ...bigrams].slice(0, config.maxTokensPerField * 2);
}

function normalizeLanguage(language: string): string {
  return language.split('-')[0]?.toLowerCase() ?? '';
}

function extractRootHost(host: string): string | null {
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  const tail = parts.slice(-2).join('.');
  const maybeTail = parts.slice(-3).join('.');
  if (MULTI_PART_TLDS.has(tail) && parts.length >= 3) {
    return parts.slice(-3).join('.');
  }
  if (MULTI_PART_TLDS.has(maybeTail) && parts.length >= 4) {
    return parts.slice(-4).join('.');
  }
  return tail;
}

function extractTld(host: string): string | null {
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  const lastTwo = parts.slice(-2).join('.');
  if (MULTI_PART_TLDS.has(lastTwo)) {
    return lastTwo;
  }
  return parts[parts.length - 1] ?? null;
}

function resolvePageType(input: FeatureExtractionInput): string | null {
  if (input.hasVideoPlayer || input.hasShortsPattern) {
    return 'video';
  }
  if (input.hasRichEditor) {
    return 'editor';
  }
  if (input.hasFormFields) {
    return 'form';
  }
  if (input.hasLargeTable) {
    return 'table';
  }
  if (input.hasInfiniteScroll || input.hasFeedLayout) {
    return 'feed';
  }
  return null;
}

function bucketCount(value: number, buckets: number[]): string {
  const sorted = [...buckets].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i += 1) {
    if (value <= sorted[i]) {
      return `<=${sorted[i]}`;
    }
  }
  return `>${sorted[sorted.length - 1]}`;
}

function bucketDuration(valueMs: number): string {
  const seconds = Math.max(0, valueMs) / 1000;
  if (seconds <= 30) return '<=30s';
  if (seconds <= 120) return '<=2m';
  if (seconds <= 600) return '<=10m';
  return '>10m';
}

function bucketRatio(value: number): string {
  if (value <= 0.25) return '<=0.25';
  if (value <= 0.5) return '<=0.5';
  if (value <= 0.75) return '<=0.75';
  return '>0.75';
}

function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}
