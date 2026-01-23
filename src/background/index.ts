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
  HolidaysCache,
  MlModelStatus
} from '../shared/types.js';
import { classifyDomain, extractDomain, normalizeDomain, domainMatches } from '../shared/utils/domain.js';
import { formatDateKey, getTodayKey, isWithinWorkSchedule, splitDurationByHour } from '../shared/utils/time.js';
import { normalizeVscodeTrackingSummary, type VscodeTrackingSummaryPayload } from '../shared/vscode-summary.js';
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
import { clearVscodeMetrics } from '../shared/utils/vscode-sync.js';
import { hasHostPermission, hasLocalhostPermission, isLocalhostUrl } from '../shared/utils/permissions.js';
import { FeatureExtractor } from '../shared/ml/featureExtractor.js';
import { FeatureVectorizer, type SparseVector, type FeatureContribution } from '../shared/ml/vectorizer.js';
import { OnlineLogisticRegression } from '../shared/ml/onlineLogisticRegression.js';
import { ModelStore, type StoredModelState } from '../shared/ml/modelStore.js';

const TRACKING_ALARM = 'sg:tracking-tick';
const MIDNIGHT_ALARM = 'sg:midnight-reset';
const TRACKING_PERIOD_MINUTES = 1; // 1 minute (alarms are clamped to >= 1 minute)
const MAX_TIMELINE_SEGMENTS = 2000;
const INACTIVE_LABEL = 'Sem atividade detectada';
const CRITICAL_MESSAGE = 'sg:critical-state';
const VSCODE_SYNC_MIN_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
const RELEASE_NOTIFICATION_ID = 'sg:release-notes';
const LAST_NOTIFIED_VERSION_KEY = 'sg:last-notified-version';
const CHANGELOG_URL = 'https://github.com/Donotavio/saul_goodman/blob/main/CHANGELOG.md';
const BLOCK_RULE_ID_BASE = 50_000;
const BLOCK_RULE_MAX = 50_500; // reserva 500 IDs para regras de bloqueio
const BLOCK_PAGE_PATH = 'src/block/block.html';
const VS_CODE_DOMAIN_ID = '__vscode:ide';
const VS_CODE_DOMAIN_LABEL = 'VS Code (IDE)';
const METADATA_REQUEST_MESSAGE = 'sg:collect-domain-metadata';
const MODEL_META_KEY = 'sg:ml-model-meta';
const MAX_SUGGESTIONS = 10;
const LOW_CONFIDENCE_COOLDOWN_MS = 15 * 60 * 1000;
const ACTIVE_LEARNING_MIN_PROB = 0.4;
const ACTIVE_LEARNING_MAX_PROB = 0.6;
const MODEL_DIMENSIONS = 1 << 16;
const MODEL_LEARNING_RATE = 0.05;
const MODEL_L2 = 0.0005;
const MODEL_MIN_FEATURE_COUNT = 3;

console.info('[Saul] Background worker started', { at: new Date().toISOString() });

function sendSuggestionToast(tabId: number, suggestion: DomainSuggestion): void {
  chrome.tabs.sendMessage(
    tabId,
    {
      type: 'sg:auto-classification-toast',
      payload: { suggestion }
    },
    () => {
      void chrome.runtime.lastError;
    }
  );
}

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

interface VscodeSummariesResponse {
  data?: {
    total_seconds?: number;
    days?: Array<{
      date: string;
      total_seconds?: number;
    }>;
  };
}

interface VscodeDurationEntry {
  startTime: number;
  endTime: number;
  durationMs: number;
  project?: string;
  language?: string;
}

interface VscodeDurationsResponse {
  data?: VscodeDurationEntry[];
  pagination?: {
    page?: number;
    perPage?: number;
    total?: number;
  };
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

function logCurrentDomainNull(reason: string, details?: Record<string, unknown>): void {
  const previousDomain = trackingState.currentDomain;
  const previousTabId = trackingState.currentTabId;
  if (!previousDomain && previousTabId === null) {
    return;
  }
  console.info('[Saul] currentDomain -> null', {
    reason,
    previousDomain,
    previousTabId,
    browserFocused: trackingState.browserFocused,
    isIdle: trackingState.isIdle,
    at: new Date().toISOString(),
    ...(details ?? {})
  });
}

function getUrlScheme(url?: string | null): string | null {
  if (!url) {
    return null;
  }
  try {
    return new URL(url).protocol;
  } catch {
    return null;
  }
}

let settingsCache: ExtensionSettings | null = null;
let metricsCache: DailyMetrics | null = null;
let lastVscodeSyncAt = 0;
let lastVscodeSummaryFallbackAt = 0;
let vscodeSyncInProgress = false; // BUG-003: Prevent race condition
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
const suggestionCache: Map<string, CachedSuggestion> = new Map();
let lastPruneTimestamp = 0;
const PRUNE_INTERVAL_MS = 5 * 60 * 1000;

interface CachedSuggestion {
  suggestion: DomainSuggestion;
  vector: SparseVector;
  probability: number;
}

interface ModelContext {
  model: OnlineLogisticRegression;
  vectorizer: FeatureVectorizer;
  extractor: FeatureExtractor;
  store: ModelStore;
  totalUpdates: number;
  lastUpdated: number;
}

let modelContext: ModelContext | null = null;
let modelContextPromise: Promise<ModelContext> | null = null;

async function getModelContext(): Promise<ModelContext> {
  if (modelContext) {
    return modelContext;
  }
  if (modelContextPromise) {
    return modelContextPromise;
  }

  modelContextPromise = (async () => {
    const store = new ModelStore();
    let stored: StoredModelState | null = null;
    try {
      stored = await store.load();
    } catch (error) {
      console.warn('Falha ao carregar modelo ML', error);
    }

    const storedWeights = stored?.dimensions === MODEL_DIMENSIONS ? stored.weights : null;
    const weights = storedWeights && storedWeights.length === MODEL_DIMENSIONS
      ? Float32Array.from(storedWeights)
      : new Float32Array(MODEL_DIMENSIONS);
    const bias = stored?.bias ?? 0;

    const storedCounts = stored?.dimensions === MODEL_DIMENSIONS ? stored.featureCounts : null;
    const counts = storedCounts && storedCounts.length === MODEL_DIMENSIONS
      ? Uint32Array.from(storedCounts)
      : new Uint32Array(MODEL_DIMENSIONS);

    const model = new OnlineLogisticRegression({
      dimensions: MODEL_DIMENSIONS,
      learningRate: MODEL_LEARNING_RATE,
      l2: MODEL_L2
    }, weights, bias);
    const vectorizer = new FeatureVectorizer(
      { dimensions: MODEL_DIMENSIONS, minFeatureCount: MODEL_MIN_FEATURE_COUNT },
      counts
    );
    const extractor = new FeatureExtractor();

    const context: ModelContext = {
      model,
      vectorizer,
      extractor,
      store,
      totalUpdates: stored?.totalUpdates ?? 0,
      lastUpdated: stored?.lastUpdated ?? 0
    };
    modelContext = context;
    return context;
  })();

  return modelContextPromise;
}

async function persistModel(context: ModelContext): Promise<void> {
  const state: StoredModelState = {
    version: 1,
    dimensions: MODEL_DIMENSIONS,
    weights: Array.from(context.model.getWeights()),
    bias: context.model.getBias(),
    featureCounts: Array.from(context.vectorizer.getCounts()),
    totalUpdates: context.totalUpdates,
    lastUpdated: context.lastUpdated
  };

  try {
    await context.store.save(state);
  } catch (error) {
    console.warn('Falha ao persistir modelo ML', error);
  }

  try {
    await chrome.storage.local.set({
      [MODEL_META_KEY]: {
        version: state.version,
        lastUpdated: state.lastUpdated,
        totalUpdates: state.totalUpdates
      }
    });
  } catch (error) {
    console.warn('Falha ao atualizar metadados do modelo ML', error);
  }
}

function buildMlReasons(contributions: FeatureContribution[]): string[] {
  if (!contributions.length) {
    return ['Sinais insuficientes para explicar a decisão.'];
  }

  return contributions.map((entry) => {
    const direction = entry.score >= 0 ? 'produtivo' : 'procrastinação';
    const magnitude = Math.abs(entry.weight).toFixed(2);
    return `Sinal: ${entry.feature} favorece ${direction} (peso ${magnitude})`;
  });
}

async function buildMlSuggestion(metadata: DomainMetadata): Promise<CachedSuggestion> {
  const context = await getModelContext();
  const features = context.extractor.extract(metadata);
  const vector = context.vectorizer.vectorize(features, true);
  const probability = context.model.predictProbability(vector);
  const classification: DomainCategory = probability >= ACTIVE_LEARNING_MAX_PROB
    ? 'productive'
    : probability <= ACTIVE_LEARNING_MIN_PROB
      ? 'procrastination'
      : 'neutral';
  const confidence = Math.round(Math.max(probability, 1 - probability) * 100);
  const contributions = context.vectorizer.explain(features, context.model.getWeights(), 3);
  const reasons = buildMlReasons(contributions);

  return {
    suggestion: {
      domain: normalizeDomain(metadata.hostname),
      classification,
      confidence,
      reasons,
      timestamp: Date.now()
    },
    vector,
    probability
  };
}

async function updateModelFromFeedback(
  domain: string,
  classification: DomainCategory,
  vector?: SparseVector
): Promise<void> {
  try {
    const context = await getModelContext();
    const label: 0 | 1 = classification === 'productive' ? 1 : 0;
    const trainingVector = vector
      ?? context.vectorizer.vectorize(
        context.extractor.extract({ hostname: domain }),
        true
      );

    context.model.update(trainingVector, label);
    context.totalUpdates += 1;
    context.lastUpdated = Date.now();
    await persistModel(context);
  } catch (error) {
    console.warn('Falha ao atualizar modelo ML com feedback', error);
  }
}

async function getMlStatus(): Promise<MlModelStatus | null> {
  try {
    const context = await getModelContext();
    const counts = context.vectorizer.getCounts();
    let activeFeatures = 0;
    for (let i = 0; i < counts.length; i += 1) {
      if (counts[i] >= context.vectorizer.minFeatureCount) {
        activeFeatures += 1;
      }
    }

    return {
      version: 1,
      dimensions: MODEL_DIMENSIONS,
      totalUpdates: context.totalUpdates,
      lastUpdated: context.lastUpdated,
      activeFeatures,
      learningRate: MODEL_LEARNING_RATE,
      l2: MODEL_L2,
      minFeatureCount: context.vectorizer.minFeatureCount,
      bias: context.model.getBias()
    };
  } catch (error) {
    console.warn('Falha ao obter status do modelo ML', error);
    return null;
  }
}

function isDomainClassified(domain: string, settings: ExtensionSettings): boolean {
  const host = normalizeDomain(domain);
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
  const host = normalizeDomain(domain);
  const history = settings.suggestionsHistory?.[host];
  if (!history) {
    return false;
  }
  const now = Date.now();
  if (history.decidedAs === 'ignored' && history.lastSuggestedAt && now - history.lastSuggestedAt > LOW_CONFIDENCE_COOLDOWN_MS) {
    return false;
  }
  if (history.ignoredUntil && history.ignoredUntil > now) {
    return true;
  }
  if (history.decidedAt && history.decidedAs && history.decidedAt + getSuggestionCooldownMs(settings) > now) {
    return true;
  }
  return false;
}

function pruneSuggestionCache(settings: ExtensionSettings, force = false): void {
  const now = Date.now();
  if (!force && now - lastPruneTimestamp < PRUNE_INTERVAL_MS) {
    return;
  }
  lastPruneTimestamp = now;
  
  for (const [domain, cached] of suggestionCache.entries()) {
    if (isDomainClassified(domain, settings) || isDomainInCooldown(domain, settings)) {
      suggestionCache.delete(domain);
      continue;
    }
    const maxAge = getSuggestionCooldownMs(settings) * 2;
    if (maxAge > 0 && cached.suggestion.timestamp + maxAge < now) {
      suggestionCache.delete(domain);
    }
  }
  if (suggestionCache.size > MAX_SUGGESTIONS) {
    const sorted = Array.from(suggestionCache.values()).sort(
      (a, b) => b.suggestion.timestamp - a.suggestion.timestamp
    );
    const keep = new Set(sorted.slice(0, MAX_SUGGESTIONS).map((entry) => entry.suggestion.domain));
    for (const key of suggestionCache.keys()) {
      if (!keep.has(key)) {
        suggestionCache.delete(key);
      }
    }
  }
}

function getActiveSuggestion(): DomainSuggestion | null {
  const domain = trackingState.currentDomain ? normalizeDomain(trackingState.currentDomain) : null;
  if (!domain) {
    return null;
  }
  return suggestionCache.get(domain)?.suggestion ?? null;
}

const messageHandlers: Record<
  RuntimeMessageType,
  (payload?: unknown) => Promise<RuntimeMessageResponse | void>
> = {
  'activity-ping': async (payload?: unknown) => handleActivityPing(payload as ActivityPingPayload),
  'metrics-request': async () => {
    await updateRestoredItems();
    await syncVscodeMetrics(true);
    const [metrics, settings, mlModel] = await Promise.all([
      getMetricsCache(),
      getSettingsCache(),
      getMlStatus()
    ]);
    pruneSuggestionCache(settings);
    return {
      metrics,
      settings,
      fairness: getFairnessSummary(),
      suggestions: Array.from(suggestionCache.values(), (entry) => entry.suggestion),
      activeSuggestion: getActiveSuggestion(),
      mlModel
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
    handleIgnoreSuggestion(payload as { domain?: string }),
  'open-extension-page': async (payload?: unknown) =>
    openExtensionPage(payload as { path?: string })
};

async function handleApplySuggestion(payload: {
  domain?: string;
  classification?: DomainCategory;
}): Promise<void> {
  const domain = normalizeDomain(payload?.domain ?? '');
  const classification = payload?.classification;
  if (!domain || (classification !== 'productive' && classification !== 'procrastination')) {
    return;
  }
  const settings = await getSettingsCache();
  const listKey = classification === 'productive' ? 'productiveDomains' : 'procrastinationDomains';
  const list = Array.isArray(settings[listKey]) ? settings[listKey] : [];
  if (!list.some((candidate) => domainMatches(domain, candidate))) {
    list.push(domain);
    settings[listKey] = Array.from(new Set(list.map(normalizeDomain))).filter(Boolean);
  }

  const now = Date.now();
  const history = settings.suggestionsHistory ?? {};
  history[domain] = {
    ...(history[domain] ?? { lastSuggestedAt: now }),
    decidedAt: now,
    decidedAs: classification
  };
  settings.suggestionsHistory = history;
  const cached = suggestionCache.get(domain);
  await updateModelFromFeedback(domain, classification, cached?.vector);
  settingsCache = settings;
  suggestionCache.delete(domain);
  pruneSuggestionCache(settings);
  await saveSettings(settings);
  await syncBlockingRules(settings);
  await refreshScore();
}

async function handleIgnoreSuggestion(payload: { domain?: string }): Promise<void> {
  const domain = normalizeDomain(payload?.domain ?? '');
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

async function openExtensionPage(payload?: { path?: string }): Promise<void> {
  const rawPath = payload?.path?.trim() ?? '';
  if (!rawPath) {
    return;
  }
  if (rawPath.includes('://')) {
    return;
  }
  const allowed = new Set(["src/popup/popup.html", "src/options/options.html", "src/report/report.html", "src/block/block.html"]);
  const normalized = rawPath.replace(/^\//, '').split('?')[0].split('#')[0];
  if (!allowed.has(normalized)) {
    return;
  }
  const url = chrome.runtime.getURL(rawPath);
  await chrome.tabs.create({ url });
}

async function maybeHandleSuggestion(domain: string, tab: chrome.tabs.Tab): Promise<void> {
  const normalizedDomain = normalizeDomain(domain);
  const settings = await getSettingsCache();
  pruneSuggestionCache(settings);

  if (!settings.enableAutoClassification) {
    return;
  }

  if (!normalizedDomain || isDomainClassified(normalizedDomain, settings)) {
    suggestionCache.delete(normalizedDomain);
    return;
  }

  if (!tab?.url || !/^https?:/i.test(tab.url)) {
    return;
  }

  const cached = suggestionCache.get(normalizedDomain);
  if (cached) {
    if (tab.id) {
      sendSuggestionToast(tab.id, cached.suggestion);
    }
    return;
  }

  const metadata = await collectDomainMetadata(tab, normalizedDomain);
  if (!metadata) {
    return;
  }

  let cachedSuggestion: CachedSuggestion;
  try {
    cachedSuggestion = await buildMlSuggestion(metadata);
  } catch (error) {
    console.warn('Falha ao gerar sugestão ML', error);
    return;
  }
  const lowConfidence =
    cachedSuggestion.probability > ACTIVE_LEARNING_MIN_PROB &&
    cachedSuggestion.probability < ACTIVE_LEARNING_MAX_PROB;
  if (!lowConfidence && isDomainInCooldown(normalizedDomain, settings)) {
    suggestionCache.delete(normalizedDomain);
    return;
  }
  if (lowConfidence && isDomainInCooldown(normalizedDomain, settings)) {
    const history = settings.suggestionsHistory?.[normalizedDomain];
    const now = Date.now();
    const lastSuggestedAt = history?.lastSuggestedAt ?? 0;
    if (now - lastSuggestedAt < LOW_CONFIDENCE_COOLDOWN_MS) {
      suggestionCache.delete(normalizedDomain);
      return;
    }
  }

  suggestionCache.set(normalizedDomain, cachedSuggestion);
  await recordSuggestionHistory(normalizedDomain, {
    lastSuggestedAt: cachedSuggestion.suggestion.timestamp,
    decidedAs: undefined,
    decidedAt: undefined,
    ignoredUntil: undefined
  });
  pruneSuggestionCache(settings);
  if (tab.id) {
    sendSuggestionToast(tab.id, cachedSuggestion.suggestion);
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
    
    try {
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
        const meta = (payload ?? {}) as DomainMetadata;
        const hostname = normalizeDomain(meta.hostname || fallbackHost);
        resolve({
          hostname,
          title: meta.title,
          description: meta.description,
          keywords: Array.isArray(meta.keywords)
            ? meta.keywords.filter((kw) => typeof kw === 'string' && kw.trim().length > 0)
            : [],
          ogType: meta.ogType,
          hasVideoPlayer: Boolean(meta.hasVideoPlayer),
          hasInfiniteScroll: Boolean(meta.hasInfiniteScroll),
          hasAutoplayMedia: Boolean(meta.hasAutoplayMedia),
          hasFeedLayout: Boolean(meta.hasFeedLayout),
          hasFormFields: Boolean(meta.hasFormFields),
          hasRichEditor: Boolean(meta.hasRichEditor),
          hasLargeTable: Boolean(meta.hasLargeTable),
          hasShortsPattern: Boolean(meta.hasShortsPattern),
          schemaTypes: Array.isArray(meta.schemaTypes)
            ? (meta.schemaTypes ?? []).filter(
                (entry) => typeof entry === 'string' && entry.trim().length > 0
              )
            : [],
          headings: Array.isArray(meta.headings)
            ? (meta.headings ?? []).filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            : [],
          pathTokens: Array.isArray(meta.pathTokens)
            ? (meta.pathTokens ?? []).filter((entry) => typeof entry === 'string' && entry.trim().length > 0)
            : [],
          language:
            typeof meta.language === 'string' && meta.language.trim().length > 0
              ? meta.language.trim()
              : undefined,
          externalLinksCount:
            typeof meta.externalLinksCount === 'number' && Number.isFinite(meta.externalLinksCount)
              ? meta.externalLinksCount
              : undefined,
          scrollDepth:
            typeof meta.scrollDepth === 'number' && Number.isFinite(meta.scrollDepth)
              ? meta.scrollDepth
              : undefined,
          interactionCount:
            typeof meta.interactionCount === 'number' && Number.isFinite(meta.interactionCount)
              ? meta.interactionCount
              : undefined,
          activeMs:
            typeof meta.activeMs === 'number' && Number.isFinite(meta.activeMs)
              ? meta.activeMs
              : undefined
        });
      });
    } catch (error) {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

async function recordSuggestionHistory(
  domain: string,
  updates: Partial<SuggestionHistoryEntry>
): Promise<void> {
  const settings = await getSettingsCache();
  const history = settings.suggestionsHistory ?? {};
  const normalized = normalizeDomain(domain);
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
  if (_sender?.id && _sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: 'Unauthorized sender' });
    return false;
  }
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
  void handleTabActivated(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  void handleTabUpdated(tabId, changeInfo, tab);
});

chrome.windows.onFocusChanged.addListener((windowId) => {
  const now = Date.now();
  const focused = windowId !== chrome.windows.WINDOW_ID_NONE;

  if (!focused) {
    void (async () => {
      trackingState.pendingSwitchFromDomain = trackingState.currentDomain;
      trackingState.awaitingVscodeReturn = true;
      await finalizeCurrentDomainSlice();
      logCurrentDomainNull('window_focus_lost', { windowId });
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
  console.info('[Saul] Background initialize:start', { at: new Date().toISOString() });

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

  console.info('[Saul] Background initialize:complete', { at: new Date().toISOString() });
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
      logCurrentDomainNull('hydrate_active_tab_missing');
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
    logCurrentDomainNull('active_tab_without_domain', {
      tabId,
      tabUrlPresent: Boolean(tab.url),
      tabUrlScheme: getUrlScheme(tab.url)
    });
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
  const sliceStart = trackingState.lastTimestamp ?? now;
  // BUG-005: Ensure elapsed is never negative (clock adjustment)
  const elapsed = Math.max(0, now - sliceStart);

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
    if (!isLocalhostUrl(baseUrl) || !(await hasLocalhostPermission())) {
      await handleVscodeSyncFailure(metrics);
      return;
    }
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

function getDayStartMs(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map((value) => Number(value));
  return new Date(year, month - 1, day).getTime();
}

function getDayEndMsExclusive(dateKey: string): number {
  return getDayStartMs(dateKey) + 24 * 60 * 60 * 1000;
}

function resolveSummaryTotalMs(summary: VscodeSummariesResponse, dateKey: string): number {
  const days = summary?.data?.days ?? [];
  const day = days.find((entry) => entry.date === dateKey) ?? days[0];
  const seconds =
    (typeof day?.total_seconds === 'number' ? day.total_seconds : undefined) ??
    summary?.data?.total_seconds ??
    0;
  return Math.max(0, seconds) * 1000;
}

function isValidVscodeDuration(duration: VscodeDurationEntry): boolean {
  const project = (duration.project ?? '').trim();
  const language = (duration.language ?? '').trim();
  if (!project || project.toLowerCase() === 'unknown') {
    return false;
  }
  if (!language || language.toLowerCase() === 'unknown') {
    return false;
  }
  return true;
}

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchVscodeTrackingSummary(
  baseUrl: string,
  pairingKey: string,
  dateKey: string
): Promise<VscodeTrackingSummaryPayload | null> {
  let url: URL;
  try {
    url = new URL('/v1/tracking/vscode/summary', baseUrl);
  } catch {
    return null;
  }
  url.searchParams.set('key', pairingKey);
  url.searchParams.set('date', dateKey);

  const response = await fetchWithTimeout(url.toString(), 4000);
  if (!response.ok) {
    return null;
  }
  return (await response.json()) as VscodeTrackingSummaryPayload;
}

// Legacy fallback for older daemon builds without /v1/tracking/vscode/summary.
async function fetchVscodeDurations(
  baseUrl: string,
  pairingKey: string
): Promise<VscodeDurationEntry[]> {
  const perPage = 200;
  let page = 1;
  let total = Infinity;
  const entries: VscodeDurationEntry[] = [];

  while (entries.length < total) {
    const url = new URL('/v1/vscode/durations', baseUrl);
    url.searchParams.set('key', pairingKey);
    url.searchParams.set('page', String(page));
    url.searchParams.set('per_page', String(perPage));

    const response = await fetchWithTimeout(url.toString(), 4000);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = (await response.json()) as VscodeDurationsResponse;
    const data = Array.isArray(payload.data) ? payload.data : [];
    const reportedTotal = payload.pagination?.total;
    if (Number.isFinite(reportedTotal)) {
      total = Number(reportedTotal);
    }
    entries.push(...data);

    if (data.length < perPage) {
      break;
    }
    page += 1;
    if (page > 50) {
      break;
    }
  }

  return entries;
}

/**
 * Consulta o SaulDaemon local para trazer o resumo diário de uso do VS Code.
 * Endpoint esperado: GET {base}/v1/tracking/vscode/summary?date=YYYY-MM-DD&key=PAIRING_KEY
 */
async function syncVscodeMetrics(force = false): Promise<void> {
  // BUG-003: Prevent race condition with parallel calls
  if (vscodeSyncInProgress) {
    return;
  }
  vscodeSyncInProgress = true;

  try {
    const settings = await getSettingsCache();
    const metrics = await getMetricsCache();
    const pairingKey = settings.vscodePairingKey;
    const integrationDisabled =
      !settings.vscodeIntegrationEnabled || !settings.vscodeLocalApiUrl || !pairingKey;

    if (integrationDisabled) {
      const cleared = clearVscodeMetrics(metrics);
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

    const baseUrl = settings.vscodeLocalApiUrl?.trim();
    if (!baseUrl) {
      return;
    }
    if (!isLocalhostUrl(baseUrl) || !(await hasLocalhostPermission())) {
      return;
    }
    const todayKey = getTodayKey();
    const trackingSummary = await fetchVscodeTrackingSummary(baseUrl, pairingKey, todayKey);
    if (trackingSummary) {
      const normalized = normalizeVscodeTrackingSummary(trackingSummary, {
        domainLabel: VS_CODE_DOMAIN_LABEL,
        category: 'productive'
      });
      const MAX_DAY_MS = 24 * 60 * 60 * 1000;
      let resolvedVscodeMs = normalized.totalActiveMs;
      if (resolvedVscodeMs > MAX_DAY_MS) {
        console.warn(
          `[Saul] VS Code time ${(resolvedVscodeMs / 3600000).toFixed(1)}h exceeds 24h, clamping`
        );
        resolvedVscodeMs = MAX_DAY_MS;
      }

      metrics.vscodeActiveMs = resolvedVscodeMs;
      metrics.vscodeSessions = normalized.sessions;
      metrics.vscodeSwitches = normalized.switches;
      metrics.vscodeSwitchHourly = normalized.switchHourly;
      metrics.vscodeTimeline = normalized.timeline;

      await persistMetrics();
      lastVscodeSyncAt = now;
      return;
    }

    if (now - lastVscodeSummaryFallbackAt > 10 * 60 * 1000) {
      console.warn('[Saul] VS Code tracking summary unavailable, falling back to legacy endpoints.');
      lastVscodeSummaryFallbackAt = now;
    }

    let summaryUrl: URL;
    try {
      summaryUrl = new URL('/v1/vscode/summaries', baseUrl);
    } catch {
      return;
    }
    summaryUrl.searchParams.set('start', todayKey);
    summaryUrl.searchParams.set('end', todayKey);
    summaryUrl.searchParams.set('key', pairingKey);

    try {
      const response = await fetchWithTimeout(summaryUrl.toString(), 4000);
      if (!response.ok) {
        await handleVscodeSyncFailure(metrics);
        return;
      }

      const summary = (await response.json()) as VscodeSummariesResponse;
      const summaryTotalMs = resolveSummaryTotalMs(summary, todayKey);
      const durations = await fetchVscodeDurations(baseUrl, pairingKey);

      const startMs = getDayStartMs(todayKey);
      const endMs = getDayEndMsExclusive(todayKey);
      const filteredTimeline: TimelineEntry[] = [];
      const switchHourly = Array.from({ length: 24 }, () => 0);
      let recalculatedVscodeMs = 0;
      let sessions = 0;
      for (const duration of durations) {
        if (!isValidVscodeDuration(duration)) {
          continue;
        }
        if (duration.endTime <= startMs || duration.startTime >= endMs) {
          continue;
        }
        sessions += 1;
        const hour = new Date(duration.startTime).getHours();
        if (switchHourly[hour] !== undefined) {
          switchHourly[hour] += 1;
        }
        const sliceStart = Math.max(duration.startTime, startMs);
        const sliceEnd = Math.min(duration.endTime, endMs);
        if (sliceEnd <= sliceStart) {
          continue;
        }
        const sliceDuration = sliceEnd - sliceStart;
        recalculatedVscodeMs += sliceDuration;
        filteredTimeline.push({
          startTime: sliceStart,
          endTime: sliceEnd,
          durationMs: sliceDuration,
          domain: VS_CODE_DOMAIN_LABEL,
          category: 'productive'
        });
      }
      filteredTimeline.sort((a, b) => a.startTime - b.startTime);

      if (summaryTotalMs > 0 && Math.abs(summaryTotalMs - recalculatedVscodeMs) > 1000) {
        console.warn(
          `[Saul] VS Code summary reported ${(summaryTotalMs / 3600000).toFixed(2)}h, ` +
            `but durations sum to ${(recalculatedVscodeMs / 3600000).toFixed(2)}h. ` +
            `Using summary value.`
        );
      }

      const MAX_DAY_MS = 24 * 60 * 60 * 1000;
      const resolvedVscodeMs = summaryTotalMs > 0 ? summaryTotalMs : recalculatedVscodeMs;
      if (resolvedVscodeMs > MAX_DAY_MS) {
        console.warn(
          `[Saul] VS Code time ${(resolvedVscodeMs / 3600000).toFixed(1)}h exceeds 24h, clamping`
        );
        metrics.vscodeActiveMs = MAX_DAY_MS;
      } else {
        metrics.vscodeActiveMs = resolvedVscodeMs;
      }

      metrics.vscodeSessions = sessions;
      metrics.vscodeSwitches = sessions;
      metrics.vscodeSwitchHourly = switchHourly;
      metrics.vscodeTimeline = filteredTimeline;

      await persistMetrics();

      lastVscodeSyncAt = now;
    } catch (error) {
      await handleVscodeSyncFailure(metrics);
      console.warn('Falha ao sincronizar métricas do VS Code', error);
    }
  } finally {
    vscodeSyncInProgress = false;
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
    // BUG-004: Explicit check for chrome.runtime.lastError
    if (chrome.runtime.lastError || !tab) {
      return;
    }
    if (await maybeRedirectBlockedTab(tabId, tab)) {
      return;
    }
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
    // Tab may have been closed
    return;
  }
}

async function handleTabActivated(tabId: number): Promise<void> {
  if (await maybeRedirectBlockedTab(tabId)) {
    return;
  }
  await updateActiveTabContext(tabId, true);
  await syncCriticalStateToTab(tabId);
}

async function handleTabUpdated(
  tabId: number,
  changeInfo: chrome.tabs.TabChangeInfo,
  tab: chrome.tabs.Tab
): Promise<void> {
  if (await maybeRedirectBlockedTab(tabId, tab)) {
    return;
  }

  if (!tab.active) {
    return;
  }

  if (changeInfo.url || changeInfo.status === 'complete') {
    await updateActiveTabContext(tabId, false, tab);
  }

  if (typeof changeInfo.audible === 'boolean' && trackingState.currentTabId === tabId) {
    trackingState.currentTabAudible = changeInfo.audible;
  }
}

async function maybeRedirectBlockedTab(
  tabId: number,
  tab?: chrome.tabs.Tab
): Promise<boolean> {
  const target = tab ?? (await chrome.tabs.get(tabId).catch(() => undefined));
  if (!target?.url || !/^https?:/i.test(target.url)) {
    return false;
  }

  const settings = await getSettingsCache();
  if (!settings?.blockProcrastination) {
    return false;
  }

  const domain = extractDomain(target.url);
  const host = domain ? normalizeDomain(domain) : '';
  if (!host) {
    return false;
  }

  const shouldBlock = settings.procrastinationDomains.some((candidate) =>
    domainMatches(host, candidate)
  );
  if (!shouldBlock) {
    return false;
  }

  const blockUrl = chrome.runtime.getURL(BLOCK_PAGE_PATH);
  if (target.url === blockUrl) {
    return false;
  }

  await chrome.tabs.update(tabId, { url: blockUrl });
  return true;
}

async function enforceBlockingOnTabs(settings: ExtensionSettings): Promise<void> {
  if (!settings.blockProcrastination) {
    return;
  }
  try {
    const tabs = await chrome.tabs.query({});
    await Promise.all(
      tabs.map((tab) => (tab.id ? maybeRedirectBlockedTab(tab.id, tab) : Promise.resolve(false)))
    );
  } catch (error) {
    console.warn('Falha ao aplicar bloqueio nos tabs abertos', error);
  }
}


async function syncBlockingRules(settings: ExtensionSettings): Promise<void> {
  if (!settings) {
    return;
  }
  if (!chrome.declarativeNetRequest?.updateDynamicRules) {
    await enforceBlockingOnTabs(settings);
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
  } finally {
    await enforceBlockingOnTabs(settings);
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
      logCurrentDomainNull('refresh_window_focus_state');
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

  // BUG-FIX: Prevent accumulating future time
  // Ensure sliceStart + duration never exceeds current time
  const now = Date.now();
  const projectedEnd = sliceStart + durationMs;
  
  if (projectedEnd > now) {
    const clippedDuration = Math.max(0, now - sliceStart);
    if (clippedDuration !== durationMs) {
      console.warn(
        `[Saul] BUG-FIX: Clipped future time. Projected end: ${new Date(projectedEnd).toLocaleTimeString()}, ` +
        `Now: ${new Date(now).toLocaleTimeString()}. ` +
        `Reduced duration from ${(durationMs / 60000).toFixed(1)}min to ${(clippedDuration / 60000).toFixed(1)}min`
      );
    }
    durationMs = clippedDuration;
  }
  
  if (durationMs <= 0) {
    return;
  }

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
  const hasHolidayPermission = settings.holidayAutoEnabled
    ? await hasHostPermission('https://date.nager.at/*')
    : false;
  const resolution = await resolveHolidayNeutralState({
    dateKey: getTodayKey(),
    countryCode: settings.holidayCountryCode,
    enabled: settings.holidayAutoEnabled && hasHolidayPermission,
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

async function handleVscodeSyncFailure(metrics: DailyMetrics): Promise<void> {
  const cleared = clearVscodeMetrics(metrics);
  if (cleared) {
    await persistMetrics();
  }
  lastVscodeSyncAt = 0;
}
