import {
  DailyMetrics,
  ExtensionSettings,
  HourlyBucket,
  LocalePreference,
  SupportedLocale,
  TabSwitchBreakdown,
  TabSwitchHourlyBucket,
  TimelineEntry,
  WorkInterval
} from './types.js';
import { getTodayKey } from './utils/time.js';
import { resolveLocale } from './i18n.js';

export enum StorageKeys {
  METRICS = 'sg:metrics',
  SETTINGS = 'sg:settings'
}

const DEFAULT_WORK_SCHEDULE: WorkInterval[] = [
  { start: '08:00', end: '12:00' },
  { start: '14:00', end: '18:00' }
];

const DEFAULT_SETTINGS: ExtensionSettings = {
  productiveDomains: [
    'google.com',
    'docs.google.com',
    'sheets.google.com',
    'drive.google.com',
    'calendar.google.com',
    'github.com',
    'gitlab.com',
    'bitbucket.org',
    'atlassian.com',
    'notion.so',
    'slack.com',
    'microsoft.com',
    'office.com',
    'teams.microsoft.com',
    'outlook.office.com',
    'figma.com',
    'miro.com',
    'zoom.us',
    'meet.google.com',
    'loom.com',
    'asana.com',
    'trello.com'
  ],
  procrastinationDomains: [
    'instagram.com',
    'facebook.com',
    'tiktok.com',
    'x.com',
    'twitter.com',
    'threads.net',
    'snapchat.com',
    'pinterest.com',
    'youtube.com',
    'netflix.com',
    'primevideo.com',
    'globoplay.com',
    'disneyplus.com',
    'twitch.tv',
    'crunchyroll.com',
    '9gag.com',
    'buzzfeed.com',
    'boredpanda.com',
    'reddit.com',
    'amazon.com',
    'mercadolivre.com.br',
    'shopee.com.br',
    'shein.com',
    'whatsapp.com',
    'telegram.org',
    'discord.com',
    'messenger.com',
    'steampowered.com',
    'store.steampowered.com',
    'epicgames.com',
    'roblox.com',
    'valorant.com',
    'pokemongolive.com'
  ],
  weights: {
    procrastinationWeight: 0.6,
    tabSwitchWeight: 0.25,
    inactivityWeight: 0.15
  },
  inactivityThresholdMs: 60000,
  locale: 'pt-BR',
  localePreference: 'auto',
  openAiKey: '',
  criticalScoreThreshold: 90,
  workSchedule: DEFAULT_WORK_SCHEDULE,
  criticalSoundEnabled: false,
  vscodeIntegrationEnabled: false,
  vscodeLocalApiUrl: 'http://127.0.0.1:3123',
  vscodePairingKey: ''
};

export function createEmptyHourly(): HourlyBucket[] {
  return Array.from({ length: 24 }).map((_, hour) => ({
    hour,
    productiveMs: 0,
    procrastinationMs: 0,
    inactiveMs: 0,
    neutralMs: 0
  }));
}

export function createEmptyTimeline(): TimelineEntry[] {
  return [];
}

export function createDefaultMetrics(): DailyMetrics {
  return {
    dateKey: getTodayKey(),
    productiveMs: 0,
    procrastinationMs: 0,
    inactiveMs: 0,
    tabSwitches: 0,
    tabSwitchBreakdown: createDefaultTabSwitchBreakdown(),
    tabSwitchHourly: createEmptyTabSwitchHourly(),
    domains: {},
    currentIndex: 0,
    lastUpdated: Date.now(),
    hourly: createEmptyHourly(),
    timeline: createEmptyTimeline(),
    overtimeProductiveMs: 0,
    windowUnfocusedMs: 0,
    audibleProcrastinationMs: 0,
    spaNavigations: 0,
    groupedMs: 0,
    restoredItems: 0,
    vscodeActiveMs: 0,
    vscodeSessions: 0,
    vscodeTimeline: [],
    vscodeSwitches: 0,
    vscodeSwitchHourly: createEmptyNumberHourly()
  };
}

export function createDefaultTabSwitchBreakdown(): TabSwitchBreakdown {
  return {
    productiveToProductive: 0,
    productiveToProcrastination: 0,
    productiveToNeutral: 0,
    procrastinationToProductive: 0,
    procrastinationToProcrastination: 0,
    procrastinationToNeutral: 0,
    neutralToProductive: 0,
    neutralToProcrastination: 0,
    neutralToNeutral: 0
  };
}

export function createEmptyTabSwitchHourly(): TabSwitchHourlyBucket[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    ...createDefaultTabSwitchBreakdown()
  }));
}

function createEmptyNumberHourly(): number[] {
  return Array.from({ length: 24 }, () => 0);
}

export function getDefaultSettings(): ExtensionSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}

export function getDefaultWorkSchedule(): WorkInterval[] {
  return JSON.parse(JSON.stringify(DEFAULT_WORK_SCHEDULE));
}

export async function getSettings(): Promise<ExtensionSettings> {
  const stored = (await chrome.storage.local.get(StorageKeys.SETTINGS))[StorageKeys.SETTINGS];
  if (stored) {
    const defaults = getDefaultSettings();
    const preference = normalizePreference(stored.localePreference, stored.locale);
    const locale = resolveLocale(preference);

    return {
      ...defaults,
      ...stored,
      locale,
      localePreference: preference,
      weights: {
        ...defaults.weights,
        ...(stored.weights ?? {})
      },
      workSchedule:
        Array.isArray(stored.workSchedule) && stored.workSchedule.length
          ? stored.workSchedule
          : defaults.workSchedule
    };
  }

  const defaults = getDefaultSettings();
  const preference = defaults.localePreference ?? 'auto';
  const locale = resolveLocale(preference);
  const normalizedDefaults = { ...defaults, locale, localePreference: preference };
  await chrome.storage.local.set({ [StorageKeys.SETTINGS]: normalizedDefaults });
  return normalizedDefaults;
}

export async function saveSettings(settings: ExtensionSettings): Promise<void> {
  await chrome.storage.local.set({ [StorageKeys.SETTINGS]: settings });
}

function normalizePreference(
  storedPreference?: LocalePreference,
  storedLocale?: SupportedLocale
): LocalePreference {
  if (storedPreference) {
    return storedPreference;
  }
  if (storedLocale && (['pt-BR', 'en-US', 'es-419'] as SupportedLocale[]).includes(storedLocale)) {
    return storedLocale;
  }
  return 'auto';
}

export async function getDailyMetrics(): Promise<DailyMetrics> {
  const stored = (await chrome.storage.local.get(StorageKeys.METRICS))[StorageKeys.METRICS];
  if (stored) {
    const metrics = stored as DailyMetrics;
    if (metrics.dateKey === getTodayKey()) {
      return metrics;
    }
  }

  const defaults = createDefaultMetrics();
  await chrome.storage.local.set({ [StorageKeys.METRICS]: defaults });
  return defaults;
}

export async function saveDailyMetrics(metrics: DailyMetrics): Promise<void> {
  await chrome.storage.local.set({ [StorageKeys.METRICS]: metrics });
}

export async function clearDailyMetrics(): Promise<DailyMetrics> {
  const freshMetrics = createDefaultMetrics();
  await saveDailyMetrics(freshMetrics);
  return freshMetrics;
}
