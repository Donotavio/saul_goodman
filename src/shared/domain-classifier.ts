import type { LearningSignals } from './types.js';

export interface ClassificationResult {
  classification: 'productive' | 'procrastination' | 'neutral';
  confidence: number; // 0–100
  reasons: string[];
}

export interface ClassificationInput {
  hostname: string;
  title?: string;
  description?: string;
  keywords?: string[];
  ogType?: string;
  hasVideoPlayer: boolean;
  hasInfiniteScroll: boolean;
  hasAutoplayMedia?: boolean;
  hasFeedLayout?: boolean;
  hasFormFields?: boolean;
  hasRichEditor?: boolean;
  hasLargeTable?: boolean;
  hasShortsPattern?: boolean;
  schemaTypes?: string[];
  headings?: string[];
  pathTokens?: string[];
  language?: string;
}

type LearningToken =
  | `host:${string}`
  | `root:${string}`
  | `kw:${string}`
  | `og:${string}`
  | `path:${string}`
  | `schema:${string}`
  | `lang:${string}`
  | 'flag:video'
  | 'flag:scroll'
  | 'flag:autoplay'
  | 'flag:feed'
  | 'flag:form'
  | 'flag:editor'
  | 'flag:table'
  | 'flag:shorts';

type LearningWeightKey = 'host' | 'root' | 'kw' | 'og' | 'path' | 'schema' | 'lang' | 'flag';

type LearningSide = 'productive' | 'procrastination';

const LEARNING_LOG_MULTIPLIER = 20;
export const LEARNING_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000; // default 30 days
const LEARNING_HALF_LIFE_BY_TYPE: Record<string, number> = {
  host: LEARNING_HALF_LIFE_MS,
  root: LEARNING_HALF_LIFE_MS,
  kw: LEARNING_HALF_LIFE_MS,
  og: LEARNING_HALF_LIFE_MS,
  path: 20 * 24 * 60 * 60 * 1000, // 20 days
  schema: 20 * 24 * 60 * 60 * 1000,
  lang: 45 * 24 * 60 * 60 * 1000,
  flag: 25 * 24 * 60 * 60 * 1000
};
export const DEFAULT_LEARNING_WEIGHTS: Record<LearningWeightKey, number> = {
  host: 3,
  root: 2,
  kw: 1,
  og: 1.5,
  path: 1.25,
  schema: 1.25,
  lang: 0.5,
  flag: 1
};
const MAX_LEARNING_REASONS = 3;

const KNOWN_HOSTS: Record<'productive' | 'procrastination', string[]> = {
  productive: [
    'docs.google.com',
    'drive.google.com',
    'calendar.google.com',
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'atlassian.com',
    'jira.com',
    'wikipedia.org',
    'notion.so',
    'figma.com',
    'slack.com',
    'microsoft.com',
    'office.com',
    'teams.microsoft.com',
    'outlook.office.com',
    'trello.com',
    'asana.com',
    'zoom.us',
    'meet.google.com'
  ],
  procrastination: [
    'youtube.com',
    'netflix.com',
    'primevideo.com',
    'globoplay.com',
    'disneyplus.com',
    'twitch.tv',
    'instagram.com',
    'facebook.com',
    'tiktok.com',
    'x.com',
    'twitter.com',
    'threads.net',
    'snapchat.com',
    'pinterest.com',
    '9gag.com',
    'buzzfeed.com',
    'boredpanda.com',
    'reddit.com',
    'amazon.com',
    'mercadolivre.com.br',
    'shopee.com.br',
    'shein.com',
    'discord.com',
    'telegram.org',
    'whatsapp.com',
    'steampowered.com',
    'store.steampowered.com',
    'epicgames.com',
    'roblox.com'
  ]
};

const PRODUCTIVE_KEYWORDS = [
  'docs',
  'api',
  'dashboard',
  'admin',
  'jira',
  'tasks',
  'issues',
  'drive',
  'calendar',
  'dev',
  'repository',
  'repo',
  'wiki',
  'notebook',
  'research',
  'university',
  'project',
  'work'
];

const PROCRASTINATION_KEYWORDS = [
  'watch',
  'video',
  'stream',
  'series',
  'movie',
  'clips',
  'meme',
  'game',
  'gaming',
  'shop',
  'sale',
  'newsfeed',
  'social',
  'live',
  'shorts',
  'playlist'
];

const PRODUCTIVE_OG_TYPES = ['article', 'book', 'profile'];
const PROCRASTINATION_OG_TYPES = ['video', 'video.other', 'movie', 'tv_show'];
const PATH_PRODUCTIVE = [
  'dashboard',
  'issue',
  'issues',
  'pull',
  'merge',
  'repo',
  'project',
  'task',
  'admin',
  'editor',
  'edit',
  'workspace'
];
const PATH_PROCRASTINATION = [
  'watch',
  'video',
  'feed',
  'timeline',
  'shorts',
  'reels',
  'stories',
  'story',
  'live',
  'playlist'
];
const SCHEMA_PRODUCTIVE = ['article', 'techarticle', 'course', 'creativework', 'softwareapplication'];
const SCHEMA_PROCRASTINATION = ['videoobject', 'mediaobject', 'movie', 'tvseason', 'tvseries'];

export function classifyDomain(
  data: ClassificationInput,
  learningSignals?: LearningSignals
): ClassificationResult {
  const host = normalizeHost(data.hostname);
  const reasons: string[] = [];
  let productiveScore = 0;
  let procrastinationScore = 0;
  let strongSignals = 0;
  let mediumSignals = 0;

  const addSignal = (
    side: 'productive' | 'procrastination',
    points: number,
    reason: string,
    strength: 'strong' | 'medium'
  ): void => {
    if (side === 'productive') {
      productiveScore += points;
    } else {
      procrastinationScore += points;
    }
    reasons.push(reason);
    if (strength === 'strong') {
      strongSignals += 1;
    } else {
      mediumSignals += 1;
    }
  };

  const hostMatch = findKnownHost(host);
  if (hostMatch) {
    addSignal(hostMatch.side, 60, `Host conhecido: ${hostMatch.match}`, 'strong');
  }

  const keywordSeen = new Set<string>();
  const keywordSources: Array<{ label: string; text?: string | null; list?: string[] }> = [
    { label: 'hostname', text: host },
    { label: 'título', text: data.title },
    { label: 'descrição', text: data.description },
    { label: 'keywords', list: data.keywords },
    { label: 'headings', list: data.headings }
  ];

  const evaluateKeyword = (
    keyword: string,
    side: 'productive' | 'procrastination',
    label: string
  ): void => {
    const key = `${side}:${keyword}`;
    if (keywordSeen.has(key)) {
      return;
    }
    keywordSeen.add(key);
    addSignal(side, 15, `Palavra-chave "${keyword}" em ${label}`, 'medium');
  };

  for (const source of keywordSources) {
    if (source.text) {
      const lower = source.text.toLowerCase();
      PRODUCTIVE_KEYWORDS.forEach((kw) => {
        if (lower.includes(kw)) {
          evaluateKeyword(kw, 'productive', source.label);
        }
      });
      PROCRASTINATION_KEYWORDS.forEach((kw) => {
        if (lower.includes(kw)) {
          evaluateKeyword(kw, 'procrastination', source.label);
        }
      });
    }

    if (Array.isArray(source.list)) {
      source.list.forEach((entry) => {
        const lower = (entry ?? '').toLowerCase();
        PRODUCTIVE_KEYWORDS.forEach((kw) => {
          if (lower.includes(kw)) {
            evaluateKeyword(kw, 'productive', source.label);
          }
        });
        PROCRASTINATION_KEYWORDS.forEach((kw) => {
          if (lower.includes(kw)) {
            evaluateKeyword(kw, 'procrastination', source.label);
          }
        });
      });
    }
  }

  if (data.hasVideoPlayer) {
    addSignal('procrastination', 25, 'Player de vídeo detectado', 'medium');
  }

  if (data.hasInfiniteScroll) {
    addSignal('procrastination', 20, 'Scroll infinito detectado', 'medium');
  }

  if (data.ogType) {
    const lowerOg = data.ogType.toLowerCase();
    if (PROCRASTINATION_OG_TYPES.some((value) => lowerOg.includes(value))) {
      addSignal('procrastination', 20, `og:type=${lowerOg}`, 'medium');
    } else if (PRODUCTIVE_OG_TYPES.some((value) => lowerOg.includes(value))) {
      addSignal('productive', 20, `og:type=${lowerOg}`, 'medium');
    }
  }

  if (Array.isArray(data.pathTokens) && data.pathTokens.length) {
    const seen = new Set<string>();
    data.pathTokens.forEach((raw) => {
      const token = raw.toLowerCase();
      if (!token || seen.has(token)) return;
      seen.add(token);
      if (PATH_PROCRASTINATION.includes(token)) {
        addSignal('procrastination', 18, `Caminho contém "${token}"`, 'medium');
      }
      if (PATH_PRODUCTIVE.includes(token)) {
        addSignal('productive', 18, `Caminho contém "${token}"`, 'medium');
      }
    });
  }

  if (Array.isArray(data.schemaTypes) && data.schemaTypes.length) {
    const seen = new Set<string>();
    data.schemaTypes.forEach((schema) => {
      const normalized = schema.toLowerCase();
      if (!normalized || seen.has(normalized)) return;
      seen.add(normalized);
      if (SCHEMA_PROCRASTINATION.some((candidate) => normalized.includes(candidate))) {
        addSignal('procrastination', 16, `schema:${normalized}`, 'medium');
      } else if (SCHEMA_PRODUCTIVE.some((candidate) => normalized.includes(candidate))) {
        addSignal('productive', 14, `schema:${normalized}`, 'medium');
      }
    });
  }

  if (data.hasAutoplayMedia) {
    addSignal('procrastination', 18, 'Mídia em autoplay detectada', 'medium');
  }
  if (data.hasFeedLayout) {
    addSignal('procrastination', 22, 'Layout de feed detectado', 'strong');
  }
  if (data.hasShortsPattern) {
    addSignal('procrastination', 20, 'Padrão de shorts/reels detectado', 'medium');
  }
  if (data.hasFormFields) {
    addSignal('productive', 12, 'Formulário interativo detectado', 'medium');
  }
  if (data.hasRichEditor) {
    addSignal('productive', 24, 'Editor de texto/código detectado', 'strong');
  }
  if (data.hasLargeTable) {
    addSignal('productive', 12, 'Tabela extensa detectada', 'medium');
  }

  const tokens = buildLearningTokens(data);
  const learning = applyLearnedSignals(tokens, learningSignals, reasons);

  const diff = productiveScore - procrastinationScore;
  const finalDiff = diff + learning.score;
  let classification: ClassificationResult['classification'] = 'neutral';
  if (finalDiff >= 15) {
    classification = 'productive';
  } else if (finalDiff <= -15) {
    classification = 'procrastination';
  }

  const signalsCount = strongSignals + mediumSignals;
  let confidence =
    signalsCount === 0 ? 10 : Math.min(100, 45 + strongSignals * 15 + mediumSignals * 10);
  if (learning.signalsUsed > 0) {
    confidence = Math.min(100, confidence + Math.min(20, learning.signalsUsed * 5));
  }
  if (classification === 'neutral') {
    confidence = Math.min(confidence, 60);
  }

  return { classification, confidence, reasons };
}

function normalizeHost(hostname: string): string {
  return (hostname ?? '').trim().toLowerCase();
}

function findKnownHost(
  host: string
): { side: 'productive' | 'procrastination'; match: string } | null {
  const matcher = (candidate: string): boolean => {
    if (!candidate) {
      return false;
    }
    return host === candidate || host.endsWith(`.${candidate}`);
  };

  for (const candidate of KNOWN_HOSTS.productive) {
    if (matcher(candidate)) {
      return { side: 'productive', match: candidate };
    }
  }

  for (const candidate of KNOWN_HOSTS.procrastination) {
    if (matcher(candidate)) {
      return { side: 'procrastination', match: candidate };
    }
  }

  return null;
}

export function buildLearningTokens(data: ClassificationInput): LearningToken[] {
  const tokens: Set<LearningToken> = new Set();
  const host = normalizeHost(data.hostname);
  if (host) {
    tokens.add(`host:${host}`);
    const root = extractRootHost(host);
    if (root && root !== host) {
      tokens.add(`root:${root}`);
    }
  }

  const keywordSources: Array<string | undefined> = [
    host,
    data.title,
    data.description,
    ...(data.keywords ?? []),
    ...(data.headings ?? [])
  ];
  keywordSources.forEach((source) => {
    if (!source) return;
    extractKeywordTokens(source).forEach((kw) => tokens.add(`kw:${kw}`));
  });

  if (data.ogType) {
    tokens.add(`og:${data.ogType.toLowerCase()}`);
  }
  if (data.hasVideoPlayer) {
    tokens.add('flag:video');
  }
  if (data.hasInfiniteScroll) {
    tokens.add('flag:scroll');
  }
  if (data.hasAutoplayMedia) {
    tokens.add('flag:autoplay');
  }
  if (data.hasFeedLayout) {
    tokens.add('flag:feed');
  }
  if (data.hasFormFields) {
    tokens.add('flag:form');
  }
  if (data.hasRichEditor) {
    tokens.add('flag:editor');
  }
  if (data.hasLargeTable) {
    tokens.add('flag:table');
  }
  if (data.hasShortsPattern) {
    tokens.add('flag:shorts');
  }
  if (Array.isArray(data.pathTokens)) {
    data.pathTokens
      .map((token) => (token ?? '').toLowerCase().trim())
      .filter(Boolean)
      .forEach((token) => tokens.add(`path:${token}` as LearningToken));
  }
  if (Array.isArray(data.schemaTypes)) {
    data.schemaTypes
      .map((schema) => (schema ?? '').toLowerCase().trim())
      .filter(Boolean)
      .forEach((schema) => tokens.add(`schema:${schema}` as LearningToken));
  }
  if (data.language) {
    tokens.add(`lang:${data.language.toLowerCase()}` as LearningToken);
  }

  return Array.from(tokens);
}

function applyLearnedSignals(
  tokens: LearningToken[],
  learningSignals: LearningSignals | undefined,
  reasons: string[]
): { score: number; signalsUsed: number } {
  if (!learningSignals?.tokens) {
    return { score: 0, signalsUsed: 0 };
  }

  let score = 0;
  let signalsUsed = 0;
  let reasonsAdded = 0;
  const now = Date.now();

  for (const token of tokens) {
    const stat = learningSignals.tokens[token];
    if (!stat) {
      continue;
    }

    const weight = getTokenWeight(token, learningSignals);
    if (weight === 0) {
      continue;
    }

    const halfLife = getHalfLifeForToken(token);
    const decayFactor = Math.pow(0.5, Math.max(0, now - stat.lastUpdated) / halfLife);
    const productive = stat.productive * decayFactor + 1;
    const procrastination = stat.procrastination * decayFactor + 1;
    const tokenScore = Math.log(productive / procrastination) * weight * LEARNING_LOG_MULTIPLIER;

    score += tokenScore;
    signalsUsed += 1;
    if (reasonsAdded < MAX_LEARNING_REASONS && Math.abs(tokenScore) >= 5) {
      const side: LearningSide = tokenScore >= 0 ? 'productive' : 'procrastination';
      reasons.push(buildLearningReason(token, side));
      reasonsAdded += 1;
    }
  }

  return { score, signalsUsed };
}

function getTokenWeight(token: LearningToken, learningSignals?: LearningSignals): number {
  const base = (learningSignals?.weights ?? {}) as Partial<Record<LearningWeightKey, number>>;
  const weights: Record<LearningWeightKey, number> = { ...DEFAULT_LEARNING_WEIGHTS };
  (Object.keys(base) as LearningWeightKey[]).forEach((key) => {
    const value = base[key];
    if (typeof value === 'number') {
      weights[key] = value;
    }
  });
  if (token.startsWith('host:')) return weights.host;
  if (token.startsWith('root:')) return weights.root;
  if (token.startsWith('kw:')) return weights.kw;
  if (token.startsWith('og:')) return weights.og;
  if (token.startsWith('path:')) return weights.path;
  if (token.startsWith('schema:')) return weights.schema;
  if (token.startsWith('lang:')) return weights.lang;
  if (token.startsWith('flag:')) return weights.flag;
  return 0;
}

function getHalfLifeForToken(token: LearningToken): number {
  if (token.startsWith('host:')) return LEARNING_HALF_LIFE_BY_TYPE.host ?? LEARNING_HALF_LIFE_MS;
  if (token.startsWith('root:')) return LEARNING_HALF_LIFE_BY_TYPE.root ?? LEARNING_HALF_LIFE_MS;
  if (token.startsWith('kw:')) return LEARNING_HALF_LIFE_BY_TYPE.kw ?? LEARNING_HALF_LIFE_MS;
  if (token.startsWith('og:')) return LEARNING_HALF_LIFE_BY_TYPE.og ?? LEARNING_HALF_LIFE_MS;
  if (token.startsWith('path:')) return LEARNING_HALF_LIFE_BY_TYPE.path ?? LEARNING_HALF_LIFE_MS;
  if (token.startsWith('schema:')) return LEARNING_HALF_LIFE_BY_TYPE.schema ?? LEARNING_HALF_LIFE_MS;
  if (token.startsWith('lang:')) return LEARNING_HALF_LIFE_BY_TYPE.lang ?? LEARNING_HALF_LIFE_MS;
  if (token.startsWith('flag:')) return LEARNING_HALF_LIFE_BY_TYPE.flag ?? LEARNING_HALF_LIFE_MS;
  return LEARNING_HALF_LIFE_MS;
}

function buildLearningReason(token: LearningToken, side: LearningSide): string {
  if (token.startsWith('host:')) {
    return `Sinal aprendido: domínio ${token.replace('host:', '')} tende a ser ${side === 'productive' ? 'produtivo' : 'procrastinação'}`;
  }
  if (token.startsWith('root:')) {
    return `Sinal aprendido: base ${token.replace('root:', '')} tende a ser ${side === 'productive' ? 'produtivo' : 'procrastinação'}`;
  }
  if (token.startsWith('kw:')) {
    return `Sinal aprendido: palavra "${token.replace('kw:', '')}" indica ${side === 'productive' ? 'produtivo' : 'procrastinação'}`;
  }
  if (token.startsWith('og:')) {
    return `Sinal aprendido: og:type ${token.replace('og:', '')} indica ${side === 'productive' ? 'produtivo' : 'procrastinação'}`;
  }
  if (token.startsWith('path:')) {
    return `Sinal aprendido: caminho "${token.replace('path:', '')}" indica ${side === 'productive' ? 'produtivo' : 'procrastinação'}`;
  }
  if (token.startsWith('schema:')) {
    return `Sinal aprendido: schema ${token.replace('schema:', '')} indica ${side === 'productive' ? 'produtivo' : 'procrastinação'}`;
  }
  if (token.startsWith('lang:')) {
    return `Sinal aprendido: idioma ${token.replace('lang:', '')} tende a ser ${side === 'productive' ? 'produtivo' : 'procrastinação'}`;
  }
  if (token === 'flag:video') {
    return `Sinal aprendido: páginas com vídeo tendem a ser ${side === 'productive' ? 'produtivas' : 'procrastinação'}`;
  }
  if (token === 'flag:scroll') {
    return `Sinal aprendido: scroll infinito tende a ser ${side === 'productive' ? 'produtivo' : 'procrastinação'}`;
  }
  if (token === 'flag:autoplay') {
    return `Sinal aprendido: autoplay tende a ser ${side === 'productive' ? 'produtivo' : 'procrastinação'}`;
  }
  if (token === 'flag:feed') {
    return `Sinal aprendido: layout de feed tende a ser ${side === 'productive' ? 'produtivo' : 'procrastinação'}`;
  }
  if (token === 'flag:form') {
    return `Sinal aprendido: páginas com formulário tendem a ser ${side === 'productive' ? 'produtivas' : 'procrastinação'}`;
  }
  if (token === 'flag:editor') {
    return `Sinal aprendido: editor rico tende a ser ${side === 'productive' ? 'produtivo' : 'procrastinação'}`;
  }
  if (token === 'flag:table') {
    return `Sinal aprendido: tabelas extensas tendem a ser ${side === 'productive' ? 'produtivas' : 'procrastinação'}`;
  }
  if (token === 'flag:shorts') {
    return `Sinal aprendido: shorts/reels tendem a ser ${side === 'productive' ? 'produtivo' : 'procrastinação'}`;
  }
  return `Sinal aprendido favorece ${side}`;
}

function extractKeywordTokens(text: string): string[] {
  const words = text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/gu)
    .map((kw) => kw.trim())
    .filter((kw) => kw.length >= 3 && kw.length <= 32);

  const ngrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    const pair = `${words[i]}_${words[i + 1]}`;
    if (pair.length <= 40) {
      ngrams.push(pair);
    }
  }

  return Array.from(new Set([...words, ...ngrams]));
}

function extractRootHost(host: string): string | null {
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return parts.slice(-2).join('.');
}
