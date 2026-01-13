import {
  calculateProcrastinationIndex,
  type ScoreComputation,
  type ScoreGuards
} from '../shared/score.js';
import {
  StorageKeys,
  clearDailyMetrics,
  createDefaultMetrics,
  createDefaultTabSwitchBreakdown,
  createEmptyHourly,
  createEmptyTabSwitchHourly,
  createEmptyTimeline,
  getDailyMetrics,
  getSettings,
  saveDailyMetrics,
  saveSettings
} from '../shared/storage.js';
import {
  ActivityPingPayload,
  DailyMetrics,
  DomainCategory,
  DomainMetadata,
  DomainSuggestion,
  SuggestionHistoryEntry,
  ExtensionSettings,
  FairnessSummary,
  HourlyBucket,
  RuntimeMessage,
  RuntimeMessageResponse,
  RuntimeMessageType,
  TimelineEntry,
  ContextModeState,
  ContextHistory,
  ManualOverrideState,
  HolidaysCache
} from '../shared/types.js';
import { classifyDomain, extractDomain, normalizeDomain, domainMatches } from '../shared/utils/domain.js';
import { classifyDomain as classifyWithMetadata } from '../shared/domain-classifier.js';
import { formatDateKey, getTodayKey, isWithinWorkSchedule, splitDurationByHour } from '../shared/utils/time.js';
import { recordTabSwitchCounts } from '../shared/tab-switch.js';
import { shouldTriggerCriticalForUrl } from '../shared/critical.js';
import { getManualOverrideState, isManualOverrideActive } from '../shared/utils/manual-override.js';
import { getContextMode } from '../shared/utils/context.js';
import {
  LocalStorageKey,
  readLocalStorage,
  writeLocalStorage
} from '../shared/utils/storage.js';
import {
  buildContextBreakdown,
  closeOpenContextSegment,
  ensureContextHistoryInitialized,
  startContextSegment
} from '../shared/utils/context-history.js';
import { resolveHolidayNeutralState } from '../shared/utils/holidays.js';

const TRACKING_ALARM = 'sg:tracking-tick';
const MIDNIGHT_ALARM = 'sg:midnight-reset';
const TRACKING_PERIOD_MINUTES = 0.25; // 15 seconds
const MAX_TIMELINE_SEGMENTS = 2000;
const INACTIVE_LABEL = 'Sem atividade detectada';
const CRITICAL_MESSAGE = 'sg:critical-state';
const VSCODE_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const RELEASE_NOTIFICATION_ID = 'sg:release-notes';
const LAST_NOTIFIED_VERSION_KEY = 'sg:last-notified-version';
const CHANGELOG_URL = 'https://github.com/Donotavio/saul_goodman/blob/main/CHANGELOG.md';
const BLOCK_RULE_ID_BASE = 50_000;
const BLOCK_RULE_MAX = 50_500; // reserva 500 IDs para regras de bloqueio
const BLOCK_PAGE_PATH = '/src/block/block.html';
const VS_CODE_DOMAIN_ID = '__vscode:ide';
const VS_CODE_DOMAIN_LABEL = 'VS Code (IDE)';
const METADATA_REQUEST_MESSAGE = 'sg:collect-domain-metadata';
const MAX_SUGGESTIONS = 10;

interface TrackingState {
  currentDomain: string | null;
  currentTabId: number | null;
  lastTimestamp: number;
  lastActivity: number;
  isIdle: boolean;
  browserFocused: boolean;
  currentTabAudible: boolean;
  currentTabGroupId: number | null;
  awaitingVscodeReturn: boolean;
  pendingSwitchFromDomain: string | null;
}

interface VscodeSummaryResponse {
  totalActiveMs: number;
  sessions: number;
  switches?: number;
  switchHourly?: number[];
  timeline?: Array<{
    startTime: number;
    endTime: number;
    durationMs: number;
  }>;
}

const trackingState: TrackingState = {
  currentDomain: null,
  currentTabId: null,
  lastTimestamp: Date.now(),
  lastActivity: Date.now(),
  isIdle: false,
  browserFocused: true,
  currentTabAudible: false,
  currentTabGroupId: null,
  awaitingVscodeReturn: false,
  pendingSwitchFromDomain: null
};

let settingsCache: ExtensionSettings | null = null;
let metricsCache: DailyMetrics | null = null;
let lastVscodeSyncAt = 0;
let initializing = false;
let globalCriticalState = false;
let lastCriticalSoundPref = false;
let lastCriticalScore = -Infinity;
let releaseNotesClickRegistered = false;
let manualOverrideState: ManualOverrideState | null = null;
let contextModeState: ContextModeState | null = null;
let contextHistory: ContextHistory = [];
let holidaysCache: HolidaysCache = {};
let holidayNeutralToday = false;
let fairnessSnapshot: FairnessSummary | null = null;
let lastScoreComputation: ScoreComputation | null = null;
const suggestionCache: Map<string, DomainSuggestion> = new Map();

function normalizeHostCandidate(domain: string): string {
  return normalizeDomain(domain);
}

function isDomainClassified(domain: string, settings: ExtensionSettings): boolean {
  const host = normalizeHostCandidate(domain);
  if (!host) {
    return false;
  }
  const listedProductive = settings.productiveDomains.some((candidate) =>
    domainMatches(host, candidate)
  );
  const listedProcrastination = settings.procrastinationDomains.some((candidate) =>
    domainMatches(host, candidate)
  );
  return listedProductive || listedProcrastination;
}

function getSuggestionCooldownMs(settings: ExtensionSettings): number {
  return settings.suggestionCooldownMs ?? 86_400_000;
}

function isDomainInCooldown(domain: string, settings: ExtensionSettings): boolean {
  const host = normalizeHostCandidate(domain);
  const history = settings.suggestionsHistory?.[host];
  if (!history) {
    return false;
  }
  const now = Date.now();
  if (history.ignoredUntil && history.ignoredUntil > now) {
    return true;
  }
  if (history.decidedAt && history.decidedAs && history.decidedAt + getSuggestionCooldownMs(settings) > now) {
    return true;
  }
  return false;
}

function pruneSuggestionCache(settings: ExtensionSettings): void {
  const now = Date.now();
  for (const [domain, suggestion] of suggestionCache.entries()) {
    if (isDomainClassified(domain, settings) || isDomainInCooldown(domain, settings)) {
      suggestionCache.delete(domain);
      continue;
    }
    const maxAge = getSuggestionCooldownMs(settings) * 2;
    if (maxAge > 0 && suggestion.timestamp + maxAge < now) {
      suggestionCache.delete(domain);
    }
  }
  if (suggestionCache.size > MAX_SUGGESTIONS) {
    const sorted = Array.from(suggestionCache.values()).sort(
      (a, b) => b.timestamp - a.timestamp
    );
    const keep = new Set(sorted.slice(0, MAX_SUGGESTIONS).map((entry) => entry.domain));
    for (const key of suggestionCache.keys()) {
      if (!keep.has(key)) {
        suggestionCache.delete(key);
      }
    }
  }
}

function getActiveSuggestion(): DomainSuggestion | null {
  const domain = trackingState.currentDomain ? normalizeHostCandidate(trackingState.currentDomain) : null;
  if (!domain) {
    return null;
  }
  return suggestionCache.get(domain) ?? null;
}

const messageHandlers: Record<
  RuntimeMessageType,
  (payload?: unknown) => Promise<RuntimeMessageResponse | void>
> = {
  'activity-ping': async (payload?: unknown) => handleActivityPing(payload as ActivityPingPayload),
  'metrics-request': async () => {
    await updateRestoredItems();
    await syncVscodeMetrics(true);
    const [metrics, settings] = await Promise.all([getMetricsCache(), getSettingsCache()]);
    pruneSuggestionCache(settings);
    return {
      metrics,
      settings,
      fairness: getFairnessSummary(),
      suggestions: Array.from(suggestionCache.values()),
      activeSuggestion: getActiveSuggestion()
    };
  },
  'clear-data': async () => clearTodayData(),
  'settings-updated': async () => {
    settingsCache = null;
    const settings = await getSettingsCache();
    applyIdleDetectionInterval(settings);
    await syncBlockingRules(settings);
    await syncVscodeMetrics(true);
    await refreshScore();
    pruneSuggestionCache(settings);
  },
  'release-notes': async (payload?: unknown) => {
    const reset = Boolean((payload as { reset?: boolean })?.reset);
    if (reset) {
      await chrome.storage.local.remove(LAST_NOTIFIED_VERSION_KEY);
    }
    await notifyReleaseNotesIfNeeded(true);
  },
  'apply-suggestion': async (payload?: unknown) =>
    handleApplySuggestion(payload as { domain?: string; classification?: DomainCategory }),
  'ignore-suggestion': async (payload?: unknown) =>
    handleIgnoreSuggestion(payload as { domain?: string })
};

async function handleApplySuggestion(payload: {
  domain?: string;
  classification?: DomainCategory;
}): Promise<void> {
  const domain = normalizeHostCandidate(payload?.domain ?? '');
  const classification = payload?.classification;
  if (!domain || (classification !== 'productive' && classification !== 'procrastination')) {
    return;
  }
  const settings = await getSettingsCache();
  const listKey = classification === 'productive' ? 'productiveDomains' : 'procrastinationDomains';
  const list = Array.isArray(settings[listKey]) ? settings[listKey] : [];
  if (!list.some((candidate) => domainMatches(domain, candidate))) {
    list.push(domain);
    settings[listKey] = Array.from(new Set(list.map(normalizeHostCandidate))).filter(Boolean);
  }

  const now = Date.now();
  const history = settings.suggestionsHistory ?? {};
  history[domain] = {
    ...(history[domain] ?? { lastSuggestedAt: now }),
    decidedAt: now,
    decidedAs: classification
  };
  settings.suggestionsHistory = history;
  settingsCache = settings;
  suggestionCache.delete(domain);
  pruneSuggestionCache(settings);
  await saveSettings(settings);
  await syncBlockingRules(settings);
  await refreshScore();
}

async function handleIgnoreSuggestion(payload: { domain?: string }): Promise<void> {
  const domain = normalizeHostCandidate(payload?.domain ?? '');
  if (!domain) {
    return;
  }
  const settings = await getSettingsCache();
  const now = Date.now();
  const history = settings.suggestionsHistory ?? {};
  const cooldown = getSuggestionCooldownMs(settings);
  history[domain] = {
    ...(history[domain] ?? { lastSuggestedAt: now }),
    ignoredUntil: now + cooldown,
    decidedAt: now,
    decidedAs: 'ignored'
  };
  settings.suggestionsHistory = history;
  settingsCache = settings;
  suggestionCache.delete(domain);
  pruneSuggestionCache(settings);
  await saveSettings(settings);
}

async function maybeHandleSuggestion(domain: string, tab: chrome.tabs.Tab): Promise<void> {
  const normalizedDomain = normalizeHostCandidate(domain);
  const settings = await getSettingsCache();
  pruneSuggestionCache(settings);

  if (!settings.enableAutoClassification) {
    return;
  }

  if (!normalizedDomain || isDomainClassified(normalizedDomain, settings)) {
    suggestionCache.delete(normalizedDomain);
    return;
  }

  if (isDomainInCooldown(normalizedDomain, settings)) {
    suggestionCache.delete(normalizedDomain);
    return;
  }

  if (!tab?.url || !/^https?:/i.test(tab.url)) {
    return;
  }

  const cached = suggestionCache.get(normalizedDomain);
  if (cached) {
    if (tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        type: 'sg:auto-classification-toast',
        payload: { suggestion: cached }
      });
    }
    return;
  }

  const metadata = await collectDomainMetadata(tab, normalizedDomain);
  if (!metadata) {
    return;
  }

  const result = classifyWithMetadata(metadata);
  const suggestion: DomainSuggestion = {
    domain: normalizedDomain,
    classification: result.classification,
    confidence: result.confidence,
    reasons: result.reasons,
    timestamp: Date.now()
  };

  suggestionCache.set(normalizedDomain, suggestion);
  await recordSuggestionHistory(normalizedDomain, {
    lastSuggestedAt: suggestion.timestamp,
    decidedAs: undefined,
    decidedAt: undefined,
    ignoredUntil: undefined
  });
  pruneSuggestionCache(settings);
  if (tab.id) {
    chrome.tabs.sendMessage(tab.id, {
      type: 'sg:auto-classification-toast',
      payload: { suggestion }
    });
  }
}

async function collectDomainMetadata(
  tab: chrome.tabs.Tab,
  fallbackHost: string
): Promise<DomainMetadata | null> {
  return new Promise((resolve) => {
    if (!tab?.id) {
      resolve(null);
      return;
    }
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      resolve(null);
    }, 2000);
    chrome.tabs.sendMessage(tab.id, { type: METADATA_REQUEST_MESSAGE }, (response) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      const payload = response as DomainMetadata | undefined;
      if (!payload || typeof payload !== 'object') {
        resolve(null);
        return;
      }
      const hostname = normalizeHostCandidate(payload.hostname || fallbackHost);
      resolve({
        hostname,
        title: payload.title,
        description: payload.description,
        keywords: Array.isArray(payload.keywords)
          ? payload.keywords.filter((kw) => typeof kw === 'string' && kw.trim().length > 0)
          : [],
        ogType: payload.ogType,
        hasVideoPlayer: Boolean(payload.hasVideoPlayer),
        hasInfiniteScroll: Boolean(payload.hasInfiniteScroll)
      });
    });
  });
}

async function recordSuggestionHistory(
  domain: string,
  updates: Partial<SuggestionHistoryEntry>
): Promise<void> {
  const settings = await getSettingsCache();
  const history = settings.suggestionsHistory ?? {};
  const normalized = normalizeHostCandidate(domain);
  const now = Date.now();
  const existing = history[normalized] ?? { lastSuggestedAt: updates.lastSuggestedAt ?? now };
  history[normalized] = {
    ...existing,
    lastSuggestedAt: updates.lastSuggestedAt ?? existing.lastSuggestedAt ?? now,
    ignoredUntil: updates.ignoredUntil,
    decidedAt: updates.decidedAt,
    decidedAs: updates.decidedAs
  };
  settings.suggestionsHistory = history;
  settingsCache = settings;
  await saveSettings(settings);
}
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
  void syncCriticalStateToTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (!tab.active) {
    return;
  }

  if (changeInfo.url || changeInfo.status === 'complete') {
    void updateActiveTabContext(tabId, false, tab);
  }

  if (typeof changeInfo.audible === 'boolean' && trackingState.currentTabId === tabId) {
    trackingState.currentTabAudible = changeInfo.audible;
  }
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  const now = Date.now();
  const focused = windowId !== chrome.windows.WINDOW_ID_NONE;

  if (!focused) {
    void (async () => {
      trackingState.pendingSwitchFromDomain = trackingState.currentDomain;
      trackingState.awaitingVscodeReturn = true;
      await finalizeCurrentDomainSlice();
      trackingState.currentDomain = null;
      trackingState.currentTabId = null;
      trackingState.currentTabAudible = false;
      trackingState.currentTabGroupId = null;
      trackingState.browserFocused = false;
      trackingState.lastActivity = now;
      trackingState.lastTimestamp = now;
    })();
    return;
  }

  trackingState.browserFocused = true;
  trackingState.awaitingVscodeReturn = false;
  trackingState.pendingSwitchFromDomain = null;
  trackingState.lastActivity = now;
  trackingState.lastTimestamp = now;
});

chrome.idle.onStateChanged.addListener((newState) => {
  const now = Date.now();
  if (newState === 'idle' || newState === 'locked') {
    void finalizeCurrentDomainSlice();
    trackingState.isIdle = true;
    trackingState.lastTimestamp = now;
  } else {
    trackingState.isIdle = false;
    trackingState.lastActivity = now;
    trackingState.lastTimestamp = now;
  }
});

chrome.webNavigation.onCommitted.addListener((details) => {
  void handleNavigationEvent(details, false);
});
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
  void handleNavigationEvent(details, true);
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
    applyIdleDetectionInterval(settingsCache);
    void syncBlockingRules(settingsCache);
    void (async () => {
      await refreshHolidayNeutralState();
      await refreshScore();
    })();
  }

  if (changes[StorageKeys.METRICS]) {
    metricsCache = changes[StorageKeys.METRICS].newValue as DailyMetrics;
  }

  if (changes[LocalStorageKey.MANUAL_OVERRIDE]) {
    manualOverrideState = changes[LocalStorageKey.MANUAL_OVERRIDE].newValue as ManualOverrideState;
    updateFairnessSummary();
    void refreshScore();
  }

  if (changes[LocalStorageKey.CONTEXT_MODE]) {
    const change = changes[LocalStorageKey.CONTEXT_MODE];
    contextModeState = change.newValue as ContextModeState;
    void handleContextModeHistoryChange(change.oldValue as ContextModeState | undefined, contextModeState);
    updateFairnessSummary();
    void refreshScore();
  }

  if (changes[LocalStorageKey.HOLIDAYS_CACHE]) {
    holidaysCache = (changes[LocalStorageKey.HOLIDAYS_CACHE].newValue as HolidaysCache) ?? {};
  }

  if (changes[LocalStorageKey.CONTEXT_HISTORY]) {
    contextHistory = (changes[LocalStorageKey.CONTEXT_HISTORY].newValue as ContextHistory) ?? [];
  }
});

chrome.sessions.onChanged.addListener(() => {
  void updateRestoredItems();
});

chrome.tabs.onRemoved.addListener(() => {
  void bumpRestoredItems(1);
  void updateRestoredItems();
});

async function initialize(): Promise<void> {
  if (initializing) {
    return;
  }

  initializing = true;

  await Promise.all([getSettingsCache(), getMetricsCache()]);
  await hydrateFairnessState();
  await updateRestoredItems();

  chrome.action.setBadgeBackgroundColor({ color: '#000000' });
  if (settingsCache) {
    applyIdleDetectionInterval(settingsCache);
    await syncBlockingRules(settingsCache);
  }
  await scheduleTrackingAlarm();
  await scheduleMidnightAlarm();
  await hydrateActiveTab();
  await syncVscodeMetrics(true);
  await notifyReleaseNotesIfNeeded();

  initializing = false;
}

async function handleTrackingTick(): Promise<void> {
  await refreshWindowFocusState();
  await getSettingsCache();
  await ensureDailyCache();

  await accumulateSlice();
  await syncVscodeMetrics();
}

async function handleMidnightReset(): Promise<void> {
  await finalizeContextHistoryForDay();
  metricsCache = await clearDailyMetrics();
  await resetContextHistoryForNewDay();
  await updateBadgeText(metricsCache.currentIndex);
  await scheduleMidnightAlarm();
  trackingState.lastTimestamp = Date.now();
  await handleMidnightFairnessReset();
}

async function hydrateActiveTab(): Promise<void> {
  try {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id) {
      await updateActiveTabContext(activeTab.id, true, activeTab);
      void syncCriticalStateToTab(activeTab.id);
    } else {
      trackingState.currentDomain = null;
      trackingState.currentTabId = null;
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
  const audible = tab.audible === true;
  const groupId = typeof tab.groupId === 'number' ? tab.groupId : null;
  const previousDomain = trackingState.currentDomain;
  const previousTabId = trackingState.currentTabId;
  const domainChanged = previousDomain !== domain;
  const tabChanged = previousTabId !== tabId;

  if (!domain) {
    if (previousDomain) {
      await finalizeCurrentDomainSlice();
    }
    trackingState.currentDomain = null;
    trackingState.currentTabId = null;
    trackingState.currentTabAudible = false;
    trackingState.currentTabGroupId = null;
    trackingState.lastTimestamp = Date.now();
    return;
  }

  if (!domainChanged && !tabChanged && !trackingState.isIdle) {
    return;
  }

  trackingState.lastActivity = Date.now();

  if (trackingState.awaitingVscodeReturn && domain) {
    await recordVscodeToChromeSwitch(domain, Date.now());
    trackingState.awaitingVscodeReturn = false;
  }

  if (previousDomain && (domainChanged || tabChanged)) {
    await finalizeCurrentDomainSlice();
    if (countSwitch) {
      await incrementTabSwitches(previousDomain, domain, Date.now());
    }
  }

  trackingState.currentDomain = domain;
  trackingState.currentTabId = tabId;
  trackingState.isIdle = false;
  trackingState.currentTabAudible = audible;
  trackingState.currentTabGroupId = groupId;
  trackingState.lastTimestamp = Date.now();
  void maybeHandleSuggestion(domain, tab);
}

async function handleActivityPing(payload: ActivityPingPayload): Promise<void> {
  const timestamp = payload?.timestamp ?? Date.now();
  trackingState.lastActivity = Math.max(trackingState.lastActivity, timestamp);

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

  const settings = await getSettingsCache();
  if (!trackingState.browserFocused) {
    await syncVscodeMetrics(true);
  }
  const metrics = await getMetricsCache();

  if (!trackingState.browserFocused) {
    const overlapMs = calculateVscodeOverlap(metrics.vscodeTimeline ?? [], sliceStart, now);
    const inactivePortion = Math.max(0, elapsed - overlapMs);

    if (overlapMs > 0 && trackingState.pendingSwitchFromDomain) {
      await recordChromeToVscodeSwitch(trackingState.pendingSwitchFromDomain, sliceStart);
      trackingState.pendingSwitchFromDomain = null;
      trackingState.awaitingVscodeReturn = true;
    }

    if (inactivePortion > 0) {
      metrics.windowUnfocusedMs = (metrics.windowUnfocusedMs ?? 0) + inactivePortion;
      recordTimelineSegment(metrics, {
        category: 'inactive',
        domain: 'Navegador em segundo plano',
        durationMs: inactivePortion,
        startTime: sliceStart,
        endTime: now
      });
      metrics.inactiveMs += inactivePortion;
      recordHourlyContribution(metrics, 'inactive', sliceStart, inactivePortion);
      await persistMetrics();
    } else {
      trackingState.lastTimestamp = now;
    }
    return;
  }

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

  const category = classifyDomain(trackingState.currentDomain, settings);

  const stats = metrics.domains[trackingState.currentDomain] ?? {
    domain: trackingState.currentDomain,
    milliseconds: 0,
    category
  };

  stats.milliseconds += elapsed;
  stats.category = category;
  metrics.domains[trackingState.currentDomain] = stats;

  const isOvertime =
    category === 'productive' &&
    !isWithinWorkSchedule(new Date(sliceStart), settings.workSchedule ?? []);

  if (category === 'productive') {
    metrics.productiveMs += elapsed;
    metrics.overtimeProductiveMs = (metrics.overtimeProductiveMs ?? 0) + (isOvertime ? elapsed : 0);
  } else if (category === 'procrastination') {
    metrics.procrastinationMs += elapsed;
    if (trackingState.currentTabAudible) {
      metrics.audibleProcrastinationMs = (metrics.audibleProcrastinationMs ?? 0) + elapsed;
    }
  }

  if (trackingState.currentTabGroupId !== null && trackingState.currentTabGroupId !== -1) {
    metrics.groupedMs = (metrics.groupedMs ?? 0) + elapsed;
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

function calculateVscodeOverlap(timeline: TimelineEntry[], start: number, end: number): number {
  if (!timeline.length) {
    return 0;
  }

  let overlap = 0;
  for (const entry of timeline) {
    const entryStart = entry.startTime ?? 0;
    const entryEnd = entry.endTime ?? 0;
    if (entryEnd <= start || entryStart >= end) {
      continue;
    }
    const clampedStart = Math.max(entryStart, start);
    const clampedEnd = Math.min(entryEnd, end);
    if (clampedEnd > clampedStart) {
      overlap += clampedEnd - clampedStart;
    }
  }

  return overlap;
}

async function finalizeCurrentDomainSlice(): Promise<void> {
  if (!trackingState.currentDomain) {
    trackingState.lastTimestamp = Date.now();
    trackingState.currentTabId = null;
    return;
  }

  await accumulateSlice();
}

async function incrementTabSwitches(
  fromDomain: string,
  toDomain: string,
  timestamp: number,
  overrideToCategory?: DomainCategory
): Promise<void> {
  const metrics = await getMetricsCache();
  const settings = await getSettingsCache();
  metrics.tabSwitches += 1;

  if (!metrics.tabSwitchBreakdown) {
    metrics.tabSwitchBreakdown = createDefaultTabSwitchBreakdown();
  }
  if (!metrics.tabSwitchHourly || metrics.tabSwitchHourly.length !== 24) {
    metrics.tabSwitchHourly = createEmptyTabSwitchHourly();
  }

  const fromCategory = classifyWithVsCode(fromDomain, settings);
  const toCategory = overrideToCategory ?? classifyWithVsCode(toDomain, settings);
  recordTabSwitchCounts(
    metrics.tabSwitchBreakdown,
    metrics.tabSwitchHourly ?? [],
    timestamp,
    fromCategory,
    toCategory
  );

  await persistMetrics();
}

async function recordChromeToVscodeSwitch(previousDomain: string, timestamp: number): Promise<void> {
  await incrementTabSwitches(previousDomain, VS_CODE_DOMAIN_ID, timestamp, 'productive');
}

async function recordVscodeToChromeSwitch(targetDomain: string, timestamp: number): Promise<void> {
  await incrementTabSwitches(VS_CODE_DOMAIN_ID, targetDomain, timestamp);
}

function classifyWithVsCode(domain: string, settings: ExtensionSettings): DomainCategory {
  if (domain === VS_CODE_DOMAIN_ID || domain === VS_CODE_DOMAIN_LABEL) {
    return 'productive';
  }
  return classifyDomain(domain, settings);
}

async function persistMetrics(): Promise<void> {
  if (!metricsCache) {
    return;
  }

  const settings = await getSettingsCache();
  applyContextBreakdown(metricsCache, settings);
  const scoreResult = calculateProcrastinationIndex(metricsCache, settings, getScoreGuards());
  metricsCache.currentIndex = scoreResult.score;
  metricsCache.lastUpdated = Date.now();
  updateFairnessSummary(scoreResult);

  await saveDailyMetrics(metricsCache);
  void publishIndexToDaemon(metricsCache, settings);
  await updateBadgeText(metricsCache.currentIndex);
  await ensureCriticalBroadcast(metricsCache.currentIndex, settings);
}

async function refreshScore(): Promise<void> {
  if (!metricsCache) {
    return;
  }

  const settings = await getSettingsCache();
  applyContextBreakdown(metricsCache, settings);
  const scoreResult = calculateProcrastinationIndex(metricsCache, settings, getScoreGuards());
  metricsCache.currentIndex = scoreResult.score;
  updateFairnessSummary(scoreResult);

  await saveDailyMetrics(metricsCache);
  void publishIndexToDaemon(metricsCache, settings);
  await updateBadgeText(metricsCache.currentIndex);
  await ensureCriticalBroadcast(metricsCache.currentIndex, settings);
}

async function ensureDailyCache(): Promise<void> {
  if (!metricsCache) {
    metricsCache = await getDailyMetrics();
  } else if (metricsCache.dateKey !== getTodayKey()) {
    metricsCache = await clearDailyMetrics();
  }

  if (!metricsCache.hourly || metricsCache.hourly.length !== 24) {
    metricsCache.hourly = createEmptyHourly();
  }

  if (!metricsCache.timeline) {
    metricsCache.timeline = createEmptyTimeline();
  }

  if (typeof metricsCache.overtimeProductiveMs !== 'number') {
    metricsCache.overtimeProductiveMs = 0;
  }

  if (!metricsCache.tabSwitchBreakdown) {
    metricsCache.tabSwitchBreakdown = createDefaultMetrics().tabSwitchBreakdown;
  }

  if (!metricsCache.tabSwitchHourly || metricsCache.tabSwitchHourly.length !== 24) {
    metricsCache.tabSwitchHourly = createEmptyTabSwitchHourly();
  }

  if (typeof metricsCache.windowUnfocusedMs !== 'number') {
    metricsCache.windowUnfocusedMs = 0;
  }

  if (typeof metricsCache.audibleProcrastinationMs !== 'number') {
    metricsCache.audibleProcrastinationMs = 0;
  }

  if (typeof metricsCache.spaNavigations !== 'number') {
    metricsCache.spaNavigations = 0;
  }

  if (typeof metricsCache.groupedMs !== 'number') {
    metricsCache.groupedMs = 0;
  }

  if (typeof metricsCache.restoredItems !== 'number') {
    metricsCache.restoredItems = 0;
  }

  if (typeof metricsCache.vscodeActiveMs !== 'number') {
    metricsCache.vscodeActiveMs = 0;
  }

  if (typeof metricsCache.vscodeSessions !== 'number') {
    metricsCache.vscodeSessions = 0;
  }

  if (!Array.isArray(metricsCache.vscodeTimeline)) {
    metricsCache.vscodeTimeline = [];
  }

  if (typeof metricsCache.vscodeSwitches !== 'number') {
    metricsCache.vscodeSwitches = 0;
  }
  if (!Array.isArray(metricsCache.vscodeSwitchHourly) || metricsCache.vscodeSwitchHourly.length !== 24) {
    metricsCache.vscodeSwitchHourly = Array.from({ length: 24 }, () => 0);
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

async function publishIndexToDaemon(
  metrics: DailyMetrics,
  settings: ExtensionSettings
): Promise<void> {
  try {
    if (!settings.vscodeIntegrationEnabled) {
      return;
    }
    const key = settings.vscodePairingKey?.trim();
    if (!key) {
      return;
    }
    const baseUrl = (settings.vscodeLocalApiUrl?.trim() || 'http://127.0.0.1:3123').trim();
    let endpoint: URL;
    try {
      endpoint = new URL('/v1/tracking/index', baseUrl);
    } catch {
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      await fetch(endpoint.toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          key,
          index: metrics.currentIndex,
          updatedAt: metrics.lastUpdated,
          date: metrics.dateKey,
          productiveMs: metrics.productiveMs,
          procrastinationMs: metrics.procrastinationMs
        }),
        signal: controller.signal
      });
    } catch (error) {
      console.warn('Falha ao publicar índice para o SaulDaemon', error);
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.warn('Erro inesperado ao publicar índice', error);
  }
}

function clearCachedVscodeMetrics(metrics: DailyMetrics): boolean {
  let changed = false;

  if (typeof metrics.vscodeActiveMs !== 'number' || metrics.vscodeActiveMs !== 0) {
    metrics.vscodeActiveMs = 0;
    changed = true;
  }

  if (typeof metrics.vscodeSessions !== 'number' || metrics.vscodeSessions !== 0) {
    metrics.vscodeSessions = 0;
    changed = true;
  }

  if (typeof metrics.vscodeSwitches !== 'number' || metrics.vscodeSwitches !== 0) {
    metrics.vscodeSwitches = 0;
    changed = true;
  }

  if (Array.isArray(metrics.vscodeTimeline) && metrics.vscodeTimeline.length) {
    metrics.vscodeTimeline = [];
    changed = true;
  }

  const needsSwitchHourlyReset =
    !Array.isArray(metrics.vscodeSwitchHourly) ||
    metrics.vscodeSwitchHourly.length !== 24 ||
    metrics.vscodeSwitchHourly.some((value) => value !== 0);

  if (needsSwitchHourlyReset) {
    metrics.vscodeSwitchHourly = Array.from({ length: 24 }, () => 0);
    changed = true;
  }

  return changed;
}

async function notifyReleaseNotesIfNeeded(forceOpen = false): Promise<void> {
  const version = chrome.runtime.getManifest().version;
  if (!version) {
    return;
  }

  const stored = await chrome.storage.local.get(LAST_NOTIFIED_VERSION_KEY);
  if (!forceOpen && stored[LAST_NOTIFIED_VERSION_KEY] === version) {
    return;
  }

  const changelogUrl = CHANGELOG_URL || chrome.runtime.getURL('CHANGELOG.md');

  const openTab = async (): Promise<void> => {
    try {
      await chrome.tabs.create({ url: changelogUrl });
    } catch {
      // ignore tab creation errors
    }
  };

  if (chrome.notifications?.create) {
    if (!releaseNotesClickRegistered) {
      chrome.notifications.onClicked.addListener(async (notificationId) => {
        if (notificationId !== RELEASE_NOTIFICATION_ID) {
          return;
        }
        await openTab();
        try {
          await chrome.notifications.clear(RELEASE_NOTIFICATION_ID);
        } catch {
          // ignore notification clear errors
        }
      });
      releaseNotesClickRegistered = true;
    }

    try {
      await chrome.notifications.create(RELEASE_NOTIFICATION_ID, {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('src/img/logotipo_saul_goodman.png'),
        title: chrome.i18n.getMessage('notification_update_title')?.replace('{version}', version) ?? `Novidades — v${version}`,
        message: chrome.i18n.getMessage('notification_update_message') ?? 'A extensão foi atualizada. Clique para ver o changelog.'
      });
      if (forceOpen) {
        await openTab();
      }
    } catch {
      await openTab();
    }
  } else {
    await openTab();
  }

  await chrome.storage.local.set({ [LAST_NOTIFIED_VERSION_KEY]: version });
}

/**
 * Consulta o SaulDaemon local para trazer o resumo diário de uso do VS Code.
 * Endpoint esperado: GET {base}/v1/tracking/vscode/summary?date=YYYY-MM-DD&key=PAIRING_KEY
 * Resposta: { totalActiveMs: number; sessions: number }
 */
async function syncVscodeMetrics(force = false): Promise<void> {
  const settings = await getSettingsCache();
  const metrics = await getMetricsCache();
  const pairingKey = settings.vscodePairingKey;
  const integrationDisabled =
    !settings.vscodeIntegrationEnabled || !settings.vscodeLocalApiUrl || !pairingKey;

  if (integrationDisabled) {
    const cleared = clearCachedVscodeMetrics(metrics);
    if (cleared) {
      await persistMetrics();
    }
    lastVscodeSyncAt = 0;
    return;
  }

  const now = Date.now();
  if (!force && now - lastVscodeSyncAt < VSCODE_SYNC_MIN_INTERVAL_MS) {
    return;
  }

  lastVscodeSyncAt = now;

  let url: URL;
  try {
    url = new URL('/v1/tracking/vscode/summary', settings.vscodeLocalApiUrl);
  } catch {
    return;
  }
  url.searchParams.set('date', getTodayKey());
  url.searchParams.set('key', pairingKey);

  try {
    const response = await fetch(url.toString());
    if (!response.ok) {
      return;
    }

    const summary = (await response.json()) as VscodeSummaryResponse;
    metrics.vscodeActiveMs = typeof summary.totalActiveMs === 'number' ? summary.totalActiveMs : 0;
    metrics.vscodeSessions = typeof summary.sessions === 'number' ? summary.sessions : 0;
    metrics.vscodeSwitches = typeof summary.switches === 'number' ? summary.switches : 0;
    metrics.vscodeSwitchHourly =
      Array.isArray(summary.switchHourly) && summary.switchHourly.length === 24
        ? summary.switchHourly
        : Array.from({ length: 24 }, () => 0);
    metrics.vscodeTimeline =
      Array.isArray(summary.timeline) && summary.timeline.length
        ? summary.timeline.map((entry) => ({
            startTime: entry.startTime,
            endTime: entry.endTime,
            durationMs: entry.durationMs,
            domain: 'VS Code (IDE)',
            category: 'productive' as const
          }))
        : [];

    await persistMetrics();

    lastVscodeSyncAt = now;
  } catch (error) {
    console.warn('Falha ao sincronizar métricas do VS Code', error);
  }
}

async function handleNavigationEvent(
  details: chrome.webNavigation.WebNavigationTransitionCallbackDetails,
  isSpaNavigation = false
): Promise<void> {
  const tabId = details.tabId;
  if (typeof tabId !== 'number' || details.frameId !== 0) {
    return;
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.active) {
      return;
    }
    if (isSpaNavigation) {
      const metrics = await getMetricsCache();
      metrics.spaNavigations = (metrics.spaNavigations ?? 0) + 1;
      await persistMetrics();
    }
    await updateActiveTabContext(tabId, false, tab);
  } catch {
    // ignore lookup errors
  }
}

async function syncBlockingRules(settings: ExtensionSettings): Promise<void> {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) {
    return;
  }
  if (!settings) {
    return;
  }

  try {
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const ownedRuleIds = existingRules
      .filter((rule) => rule.id >= BLOCK_RULE_ID_BASE && rule.id <= BLOCK_RULE_MAX)
      .map((rule) => rule.id);

    const normalizedDomains = (settings.procrastinationDomains ?? [])
      .map((domain) => extractDomain(domain) ?? normalizeDomain(domain))
      .map((domain) => normalizeDomain(domain ?? ''))
      .filter((domain) => Boolean(domain))
      .slice(0, BLOCK_RULE_MAX - BLOCK_RULE_ID_BASE + 1);

    const addRules: chrome.declarativeNetRequest.Rule[] = settings.blockProcrastination
      ? normalizedDomains.map((domain, index) => ({
          id: BLOCK_RULE_ID_BASE + index,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
            redirect: {
              extensionPath: BLOCK_PAGE_PATH
            }
          },
          condition: {
            urlFilter: `||${domain}^`,
            resourceTypes: [
              chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
              chrome.declarativeNetRequest.ResourceType.SUB_FRAME
            ]
          }
        }))
      : [];

    const removeRuleIds = Array.from(
      new Set([...ownedRuleIds, ...addRules.map((rule) => rule.id)])
    );

    if (!removeRuleIds.length && !addRules.length) {
      return;
    }

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds,
      addRules
    });
  } catch (error) {
    console.warn('Falha ao sincronizar regras de bloqueio', error);
  }
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

async function refreshWindowFocusState(): Promise<void> {
  try {
    const win = await chrome.windows.getLastFocused();
    const now = Date.now();
    const wasFocused = trackingState.browserFocused;
    const isFocused = Boolean(win?.focused);

    if (!isFocused && wasFocused) {
      await finalizeCurrentDomainSlice();
      trackingState.currentDomain = null;
      trackingState.currentTabId = null;
      trackingState.currentTabAudible = false;
      trackingState.currentTabGroupId = null;
      trackingState.browserFocused = false;
      trackingState.lastActivity = now;
      trackingState.lastTimestamp = now;
      return;
    }

    if (isFocused && !wasFocused) {
      trackingState.browserFocused = true;
      trackingState.awaitingVscodeReturn = false;
      trackingState.lastActivity = now;
      trackingState.lastTimestamp = now;
      await hydrateActiveTab();
    }
  } catch {
    // ignore focus lookup errors
  }
}

async function updateBadgeText(score: number): Promise<void> {
  const safeScore = Number.isFinite(score) ? Math.round(score) : 0;
  const text = safeScore.toString().padStart(2, '0');
  chrome.action.setBadgeText({ text });
}

async function clearTodayData(): Promise<void> {
  metricsCache = await clearDailyMetrics();
  await resetContextHistoryForNewDay();
  trackingState.currentDomain = null;
  trackingState.currentTabId = null;
  trackingState.isIdle = false;
  trackingState.lastActivity = Date.now();
  trackingState.lastTimestamp = Date.now();
  await updateBadgeText(metricsCache.currentIndex);
  await hydrateActiveTab();
  await broadcastCriticalState(false, settingsCache ?? (await getSettingsCache()));
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

function applyIdleDetectionInterval(settings: ExtensionSettings): void {
  const intervalSeconds = Math.max(15, Math.round((settings.inactivityThresholdMs ?? 60000) / 1000));
  chrome.idle.setDetectionInterval(intervalSeconds);
}

/**
 * Atualiza as métricas em memória com o detalhamento por contexto.
 * @param metrics Métricas do dia corrente.
 * @param settings Configurações atuais que influenciam nos índices hipotéticos.
 */
function applyContextBreakdown(metrics: DailyMetrics, settings: ExtensionSettings): void {
  const breakdown = buildContextBreakdown({ history: contextHistory, metrics, settings });
  metrics.contextDurations = breakdown.durations;
  metrics.contextIndices = breakdown.indices;
}

/**
 * Restaura o histórico de contexto armazenado localmente ou cria um segmento inicial.
 */
async function hydrateContextHistoryState(): Promise<void> {
  const now = Date.now();
  const activeContext =
    contextModeState ?? ({ value: 'work', updatedAt: now } as ContextModeState);
  const stored = await readLocalStorage<ContextHistory>(LocalStorageKey.CONTEXT_HISTORY);
  if (!stored?.length) {
    contextHistory = ensureContextHistoryInitialized(undefined, activeContext, now);
    await writeLocalStorage(LocalStorageKey.CONTEXT_HISTORY, contextHistory);
    return;
  }
  const last = stored[stored.length - 1];
  if (typeof last?.end === 'number') {
    contextHistory = ensureContextHistoryInitialized(stored, activeContext, now);
    await writeLocalStorage(LocalStorageKey.CONTEXT_HISTORY, contextHistory);
    return;
  }
  contextHistory = stored;
}

/**
 * Registra a transição de contexto criando novos segmentos temporais.
 * @param previous Estado anterior do contexto, usado como referência.
 * @param next Novo estado escolhido pelo usuário.
 */
async function handleContextModeHistoryChange(
  previous: ContextModeState | undefined,
  next: ContextModeState | null
): Promise<void> {
  if (!next) {
    return;
  }
  const timestamp = next.updatedAt ?? Date.now();
  const reference = previous ?? next;
  contextHistory = ensureContextHistoryInitialized(contextHistory, reference, timestamp);
  const last = contextHistory[contextHistory.length - 1];
  if (last && last.value === next.value && typeof last.end !== 'number') {
    return;
  }
  closeOpenContextSegment(contextHistory, timestamp);
  startContextSegment(contextHistory, next.value, timestamp);
  await writeLocalStorage(LocalStorageKey.CONTEXT_HISTORY, contextHistory);
  await persistMetrics();
}

/**
 * Finaliza o segmento ativo antes de zerar as métricas diárias.
 */
async function finalizeContextHistoryForDay(): Promise<void> {
  const now = Date.now();
  const contextState = contextModeState ?? ({ value: 'work', updatedAt: now } as ContextModeState);
  contextHistory = ensureContextHistoryInitialized(contextHistory, contextState, now);
  closeOpenContextSegment(contextHistory, now);
  await writeLocalStorage(LocalStorageKey.CONTEXT_HISTORY, contextHistory);
  await persistMetrics();
}

/**
 * Reinicia o histórico de contexto ao começar um novo dia.
 */
async function resetContextHistoryForNewDay(): Promise<void> {
  const now = Date.now();
  const contextState = contextModeState ?? ({ value: 'work', updatedAt: now } as ContextModeState);
  contextHistory = ensureContextHistoryInitialized([], contextState, now);
  await writeLocalStorage(LocalStorageKey.CONTEXT_HISTORY, contextHistory);
}

void initialize();

function getScoreGuards(): ScoreGuards {
  return {
    manualOverride: manualOverrideState ?? undefined,
    contextMode: contextModeState ?? undefined,
    holidayNeutral: holidayNeutralToday
  };
}

function getFairnessSummary(): FairnessSummary {
  if (!fairnessSnapshot) {
    updateFairnessSummary();
  }
  return (
    fairnessSnapshot ?? {
      rule: 'normal',
      manualOverrideActive: false,
      contextMode: contextModeState ?? { value: 'work', updatedAt: Date.now() },
      holidayNeutral: false,
      isHolidayToday: holidayNeutralToday
    }
  );
}

function updateFairnessSummary(result?: ScoreComputation): void {
  if (result) {
    lastScoreComputation = result;
  }
  const source = result ?? lastScoreComputation;
  const context =
    source?.contextMode ?? contextModeState ?? ({ value: 'work', updatedAt: Date.now() } as ContextModeState);
  const manualActive =
    source?.manualOverrideActive ?? isManualOverrideActive(manualOverrideState, getTodayKey());
  const appliedRule =
    manualActive && (!source || source.rule !== 'manual-override') ? 'manual-override' : source?.rule ?? 'normal';
  const resolvedHolidayNeutral = source?.holidayNeutral ?? holidayNeutralToday;
  fairnessSnapshot = {
    rule: appliedRule,
    manualOverrideActive: manualActive,
    contextMode: context,
    holidayNeutral: resolvedHolidayNeutral,
    isHolidayToday: holidayNeutralToday
  };
}

async function hydrateFairnessState(): Promise<void> {
  manualOverrideState = await getManualOverrideState();
  contextModeState = await getContextMode();
  await hydrateContextHistoryState();
  holidaysCache = (await readLocalStorage<HolidaysCache>(LocalStorageKey.HOLIDAYS_CACHE)) ?? {};
  await refreshHolidayNeutralState();
  updateFairnessSummary();
}

async function refreshHolidayNeutralState(): Promise<void> {
  const settings = await getSettingsCache();
  const resolution = await resolveHolidayNeutralState({
    dateKey: getTodayKey(),
    countryCode: settings.holidayCountryCode,
    enabled: settings.holidayAutoEnabled,
    cache: holidaysCache
  });
  holidayNeutralToday = resolution.isHoliday;
  holidaysCache = resolution.cache;
  if (resolution.source === 'api') {
    await writeLocalStorage(LocalStorageKey.HOLIDAYS_CACHE, holidaysCache);
  }
  updateFairnessSummary();
}

async function handleMidnightFairnessReset(): Promise<void> {
  manualOverrideState = await getManualOverrideState();
  await refreshHolidayNeutralState();
}

async function ensureCriticalBroadcast(score: number, settings: ExtensionSettings): Promise<void> {
  const threshold = settings.criticalScoreThreshold ?? 90;
  const soundPref = Boolean(settings.criticalSoundEnabled);
  const nextState = score >= threshold;
  const soundChanged = soundPref !== lastCriticalSoundPref;
  const stateChanged = nextState !== globalCriticalState;
  const scoreBump = nextState && score > lastCriticalScore;

  let shouldNotify = false;
  if (stateChanged) {
    shouldNotify = true;
  } else if (nextState && (scoreBump || soundChanged)) {
    shouldNotify = true;
  }

  if (shouldNotify) {
    await broadcastCriticalState(nextState, settings);
  }

  lastCriticalSoundPref = soundPref;
  lastCriticalScore = nextState ? score : -Infinity;
}

async function broadcastCriticalState(active: boolean, settings: ExtensionSettings): Promise<void> {
  globalCriticalState = active;
  const tabs = await chrome.tabs.query({ active: true });
  await Promise.all(
    tabs
      .filter((tab): tab is chrome.tabs.Tab & { id: number } => typeof tab.id === 'number')
      .map((tab) => sendCriticalMessageToTab(tab, settings, active))
  );
}

async function syncCriticalStateToTab(tabId: number): Promise<void> {
  if (!tabId) {
    return;
  }
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab || typeof tab.id !== 'number') {
      return;
    }
    const settings = await getSettingsCache();
    await sendCriticalMessageToTab(tab as chrome.tabs.Tab & { id: number }, settings, globalCriticalState);
  } catch {
    // ignore errors (tab might have closed)
  }
}

function sendCriticalMessageToTab(
  tab: chrome.tabs.Tab & { id: number },
  settings: ExtensionSettings,
  active: boolean
): Promise<void> {
  const shouldTrigger = active && shouldTriggerCriticalForUrl(tab.url, settings);
  const payload = {
    type: CRITICAL_MESSAGE,
    payload: {
      active: shouldTrigger,
      soundEnabled: shouldTrigger && Boolean(settings.criticalSoundEnabled)
    }
  };

  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tab.id, payload, () => {
      void chrome.runtime.lastError;
      resolve();
    });
  });
}

async function updateRestoredItems(): Promise<void> {
  try {
    const metrics = await getMetricsCache();
    const items = await chrome.sessions.getRecentlyClosed({ maxResults: 100 });
    const today = getTodayKey();

    if (!items.length && (metrics.restoredItems ?? 0) > 0) {
      return;
    }

    const countToday = items.reduce((acc, item) => {
      const ts = item.lastModified;
      if (!ts) {
        return acc;
      }
      const d = new Date(ts);
      const key = formatDateKey(d);
      if (key !== today) {
        return acc;
      }
      if (item.tab) {
        return acc + 1;
      }
      if (item.window) {
        const tabs = item.window.tabs?.length ?? 1;
        return acc + tabs;
      }
      return acc;
    }, 0);

    const current = metrics.restoredItems ?? 0;
    const next = Math.max(current, countToday);

    if (next === current) {
      return;
    }

    metrics.restoredItems = next;
    await persistMetrics();
  } catch (error) {
    console.warn('Falha ao atualizar abas fechadas', error);
  }
}

async function bumpRestoredItems(delta: number): Promise<void> {
  if (delta <= 0) {
    return;
  }
  const metrics = await getMetricsCache();
  metrics.restoredItems = (metrics.restoredItems ?? 0) + delta;
  await persistMetrics();
}
