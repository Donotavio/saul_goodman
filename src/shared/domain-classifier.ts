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
}

type LearningToken =
  | `host:${string}`
  | `root:${string}`
  | `kw:${string}`
  | `og:${string}`
  | 'flag:video'
  | 'flag:scroll';

type LearningSide = 'productive' | 'procrastination';

const LEARNING_LOG_MULTIPLIER = 20;
const LEARNING_HALF_LIFE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const LEARNING_TOKEN_WEIGHTS: Record<string, number> = {
  host: 3,
  root: 2,
  kw: 1,
  og: 1.5,
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
    { label: 'keywords', list: data.keywords }
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
    ...(data.keywords ?? [])
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

    const weight = getTokenWeight(token);
    if (weight === 0) {
      continue;
    }

    const decayFactor = Math.pow(0.5, Math.max(0, now - stat.lastUpdated) / LEARNING_HALF_LIFE_MS);
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

function getTokenWeight(token: LearningToken): number {
  if (token.startsWith('host:')) return LEARNING_TOKEN_WEIGHTS.host;
  if (token.startsWith('root:')) return LEARNING_TOKEN_WEIGHTS.root;
  if (token.startsWith('kw:')) return LEARNING_TOKEN_WEIGHTS.kw;
  if (token.startsWith('og:')) return LEARNING_TOKEN_WEIGHTS.og;
  if (token.startsWith('flag:')) return LEARNING_TOKEN_WEIGHTS.flag;
  return 0;
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
  if (token === 'flag:video') {
    return `Sinal aprendido: páginas com vídeo tendem a ser ${side === 'productive' ? 'produtivas' : 'procrastinação'}`;
  }
  if (token === 'flag:scroll') {
    return `Sinal aprendido: scroll infinito tende a ser ${side === 'productive' ? 'produtivo' : 'procrastinação'}`;
  }
  return `Sinal aprendido favorece ${side}`;
}

function extractKeywordTokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9á-úà-ùãõâêîôûç]+/i)
    .map((kw) => kw.trim())
    .filter((kw) => kw.length >= 3 && kw.length <= 32);
}

function extractRootHost(host: string): string | null {
  const parts = host.split('.').filter(Boolean);
  if (parts.length < 2) {
    return null;
  }
  return parts.slice(-2).join('.');
}
