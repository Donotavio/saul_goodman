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

export function classifyDomain(data: ClassificationInput): ClassificationResult {
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

  const diff = productiveScore - procrastinationScore;
  let classification: ClassificationResult['classification'] = 'neutral';
  if (diff >= 15) {
    classification = 'productive';
  } else if (diff <= -15) {
    classification = 'procrastination';
  }

  const signalsCount = strongSignals + mediumSignals;
  let confidence =
    signalsCount === 0 ? 10 : Math.min(100, 45 + strongSignals * 15 + mediumSignals * 10);
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
