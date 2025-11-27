import { calculateProcrastinationIndex } from '../shared/score.js';
import {
  StorageKeys,
  clearDailyMetrics,
  createDefaultMetrics,
  getDailyMetrics,
  getSettings,
  saveDailyMetrics
} from '../shared/storage.js';
import {
  ActivityPingPayload,
  DailyMetrics,
  DomainCategory,
  ExtensionSettings,
  HourlyBucket,
  RuntimeMessage,
  RuntimeMessageResponse,
  RuntimeMessageType
} from '../shared/types.js';
import { classifyDomain, extractDomain } from '../shared/utils/domain.js';
import { getTodayKey, splitDurationByHour } from '../shared/utils/time.js';

const TRACKING_ALARM = 'sg:tracking-tick';
const MIDNIGHT_ALARM = 'sg:midnight-reset';
const TRACKING_PERIOD_MINUTES = 0.25; // 15 seconds
const MAX_TIMELINE_SEGMENTS = 2000;
const INACTIVE_LABEL = 'Sem atividade detectada';

interface TrackingState {
  currentDomain: string | null;
  lastTimestamp: number;
  lastActivity: number;
  isIdle: boolean;
}

const trackingState: TrackingState = {
  currentDomain: null,
  lastTimestamp: Date.now(),
  lastActivity: Date.now(),
  isIdle: false
};

let settingsCache: ExtensionSettings | null = null;
let metricsCache: DailyMetrics | null = null;
let initializing = false;

const messageHandlers: Record<
  RuntimeMessageType,
  (payload?: unknown) => Promise<RuntimeMessageResponse | void>
> = {
  'activity-ping': async (payload?: unknown) => handleActivityPing(payload as ActivityPingPayload),
  'metrics-request': async () => {
    const [metrics, settings] = await Promise.all([getMetricsCache(), getSettingsCache()]);
    return { metrics, settings };
  },
  'clear-data': async () => clearTodayData(),
  'settings-updated': async () => {
    settingsCache = null;
    await getSettingsCache();
    await refreshScore();
  }
};

chrome.runtime.onInstalled.addListener(() => {
  void initialize();
});

chrome.runtime.onStartup.addListener(() => {
  void initialize();
});

chrome.runtime.onMessage.addListener((message: RuntimeMessage, _sender, sendResponse) => {
  const handler = messageHandlers[message.type];
  if (!handler) {
    sendResponse({ ok: false, error: `No handler for message type ${message.type}` });
    return false;
  }

  handler(message.payload)
    .then((result) => sendResponse({ ok: true, data: result }))
    .catch((error: Error) => {
      console.error('Saul Goodman background error:', error);
      sendResponse({ ok: false, error: error.message });
    });

  return true;
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void updateActiveTabContext(tabId, true);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active) {
    return;
  }

  if (changeInfo.url || changeInfo.status === 'complete') {
    void updateActiveTabContext(tabId, false, tab);
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === TRACKING_ALARM) {
    void handleTrackingTick();
  }

  if (alarm.name === MIDNIGHT_ALARM) {
    void handleMidnightReset();
  }
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  if (changes[StorageKeys.SETTINGS]) {
    settingsCache = changes[StorageKeys.SETTINGS].newValue as ExtensionSettings;
    void refreshScore();
  }

  if (changes[StorageKeys.METRICS]) {
    metricsCache = changes[StorageKeys.METRICS].newValue as DailyMetrics;
  }
});

async function initialize(): Promise<void> {
  if (initializing) {
    return;
  }

  initializing = true;

  await Promise.all([getSettingsCache(), getMetricsCache()]);

  chrome.action.setBadgeBackgroundColor({ color: '#000000' });
  await scheduleTrackingAlarm();
  await scheduleMidnightAlarm();
  await hydrateActiveTab();

  initializing = false;
}

async function handleTrackingTick(): Promise<void> {
  await getSettingsCache();
  await ensureDailyCache();

  const threshold = settingsCache?.inactivityThresholdMs ?? 60000;
  const now = Date.now();
  const idleTimeoutReached = now - trackingState.lastActivity >= threshold;

  if (!trackingState.isIdle && idleTimeoutReached) {
    await finalizeCurrentDomainSlice();
    trackingState.isIdle = true;
    trackingState.lastTimestamp = now;
  } else {
    await accumulateSlice();
  }
}

async function handleMidnightReset(): Promise<void> {
  metricsCache = await clearDailyMetrics();
  await updateBadgeText(metricsCache.currentIndex);
  await scheduleMidnightAlarm();
  trackingState.lastTimestamp = Date.now();
}

async function hydrateActiveTab(): Promise<void> {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) {
      await updateActiveTabContext(activeTab.id, true, activeTab);
    } else {
      trackingState.currentDomain = null;
    }
  } catch (error) {
    console.warn('Unable to hydrate active tab', error);
  }
}

async function updateActiveTabContext(tabId: number, countSwitch: boolean, providedTab?: chrome.tabs.Tab): Promise<void> {
  const tab = providedTab ?? (await chrome.tabs.get(tabId).catch(() => undefined));
  if (!tab) {
    return;
  }

  const domain = tab.url ? extractDomain(tab.url) : null;
  const previousDomain = trackingState.currentDomain;

  if (!domain) {
    if (previousDomain) {
      await finalizeCurrentDomainSlice();
    }
    trackingState.currentDomain = null;
    trackingState.lastTimestamp = Date.now();
    return;
  }

  if (previousDomain === domain && !trackingState.isIdle) {
    return;
  }

  trackingState.lastActivity = Date.now();

  if (previousDomain && previousDomain !== domain) {
    await finalizeCurrentDomainSlice();
    if (countSwitch) {
      await incrementTabSwitches();
    }
  }

  trackingState.currentDomain = domain;
  trackingState.isIdle = false;
  trackingState.lastTimestamp = Date.now();
}

async function handleActivityPing(payload: ActivityPingPayload): Promise<void> {
  trackingState.lastActivity = payload?.timestamp ?? Date.now();

  if (trackingState.isIdle) {
    trackingState.isIdle = false;
    trackingState.lastTimestamp = Date.now();
  }
}

async function accumulateSlice(): Promise<void> {
  const now = Date.now();
  const sliceStart = trackingState.lastTimestamp;
  const elapsed = now - sliceStart;

  if (elapsed <= 0) {
    return;
  }

  trackingState.lastTimestamp = now;

  const metrics = await getMetricsCache();

  if (trackingState.isIdle) {
    metrics.inactiveMs += elapsed;
    recordTimelineSegment(metrics, {
      category: 'inactive',
      domain: INACTIVE_LABEL,
      durationMs: elapsed,
      startTime: sliceStart,
      endTime: now
    });
    recordHourlyContribution(metrics, 'inactive', sliceStart, elapsed);
    await persistMetrics();
    return;
  }

  if (!trackingState.currentDomain) {
    return;
  }

  const settings = await getSettingsCache();
  const category = classifyDomain(trackingState.currentDomain, settings);

  const stats = metrics.domains[trackingState.currentDomain] ?? {
    domain: trackingState.currentDomain,
    milliseconds: 0,
    category
  };

  stats.milliseconds += elapsed;
  stats.category = category;
  metrics.domains[trackingState.currentDomain] = stats;

  if (category === 'productive') {
    metrics.productiveMs += elapsed;
  } else if (category === 'procrastination') {
    metrics.procrastinationMs += elapsed;
  }

  recordTimelineSegment(metrics, {
    category,
    domain: trackingState.currentDomain,
    durationMs: elapsed,
    startTime: sliceStart,
    endTime: now
  });
  recordHourlyContribution(metrics, category, sliceStart, elapsed);

  await persistMetrics();
}

async function finalizeCurrentDomainSlice(): Promise<void> {
  if (!trackingState.currentDomain) {
    trackingState.lastTimestamp = Date.now();
    return;
  }

  await accumulateSlice();
}

async function incrementTabSwitches(): Promise<void> {
  const metrics = await getMetricsCache();
  metrics.tabSwitches += 1;
  await persistMetrics();
}

async function persistMetrics(): Promise<void> {
  if (!metricsCache) {
    return;
  }

  const settings = await getSettingsCache();
  metricsCache.currentIndex = calculateProcrastinationIndex(metricsCache, settings);
  metricsCache.lastUpdated = Date.now();

  await saveDailyMetrics(metricsCache);
  await updateBadgeText(metricsCache.currentIndex);
}

async function refreshScore(): Promise<void> {
  if (!metricsCache) {
    return;
  }

  const settings = await getSettingsCache();
  metricsCache.currentIndex = calculateProcrastinationIndex(metricsCache, settings);

  await saveDailyMetrics(metricsCache);
  await updateBadgeText(metricsCache.currentIndex);
}

async function ensureDailyCache(): Promise<void> {
  if (!metricsCache) {
    metricsCache = await getDailyMetrics();
  } else if (metricsCache.dateKey !== getTodayKey()) {
    metricsCache = await clearDailyMetrics();
  }

  if (!metricsCache.hourly || metricsCache.hourly.length !== 24) {
    metricsCache.hourly = createDefaultMetrics().hourly;
  }

  if (!metricsCache.timeline) {
    metricsCache.timeline = createDefaultMetrics().timeline;
  }
}

async function getMetricsCache(): Promise<DailyMetrics> {
  await ensureDailyCache();
  return metricsCache as DailyMetrics;
}

async function getSettingsCache(): Promise<ExtensionSettings> {
  if (!settingsCache) {
    settingsCache = await getSettings();
  }

  return settingsCache;
}

async function scheduleTrackingAlarm(): Promise<void> {
  chrome.alarms.create(TRACKING_ALARM, { periodInMinutes: TRACKING_PERIOD_MINUTES });
}

async function scheduleMidnightAlarm(): Promise<void> {
  const now = new Date();
  const next = new Date(now);
  next.setHours(24, 0, 5, 0);
  chrome.alarms.create(MIDNIGHT_ALARM, { when: next.getTime() });
}

async function updateBadgeText(score: number): Promise<void> {
  const safeScore = Number.isFinite(score) ? Math.round(score) : 0;
  const text = safeScore.toString().padStart(2, '0');
  chrome.action.setBadgeText({ text });
}

async function clearTodayData(): Promise<void> {
  metricsCache = await clearDailyMetrics();
  trackingState.currentDomain = null;
  trackingState.isIdle = false;
  trackingState.lastActivity = Date.now();
  trackingState.lastTimestamp = Date.now();
  await updateBadgeText(metricsCache.currentIndex);
  await hydrateActiveTab();
}

function recordHourlyContribution(
  metrics: DailyMetrics,
  category: DomainCategory | 'inactive',
  sliceStart: number,
  durationMs: number
): void {
  const keyMap: Record<DomainCategory | 'inactive', keyof HourlyBucket> = {
    productive: 'productiveMs',
    procrastination: 'procrastinationMs',
    neutral: 'neutralMs',
    inactive: 'inactiveMs'
  };

  const segments = splitDurationByHour(sliceStart, durationMs);
  for (const segment of segments) {
    const bucket = metrics.hourly[segment.hour];
    if (!bucket) {
      continue;
    }
    const field = keyMap[category];
    bucket[field] += segment.milliseconds;
  }
}

function recordTimelineSegment(
  metrics: DailyMetrics,
  entry: {
    category: DomainCategory | 'inactive';
    domain: string;
    durationMs: number;
    startTime: number;
    endTime: number;
  }
): void {
  metrics.timeline.push({
    startTime: entry.startTime,
    endTime: entry.endTime,
    durationMs: entry.durationMs,
    domain: entry.domain,
    category: entry.category
  });

  if (metrics.timeline.length > MAX_TIMELINE_SEGMENTS) {
    metrics.timeline.splice(0, metrics.timeline.length - MAX_TIMELINE_SEGMENTS);
  }
}

void initialize();
