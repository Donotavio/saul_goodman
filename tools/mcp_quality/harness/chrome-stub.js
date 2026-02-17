/*
 * Dev-only Chrome API stub for the MCP harness.
 * Loaded only on harness pages to emulate storage/runtime behavior without the extension context.
 */
(() => {
  const globalScope = typeof window !== 'undefined' ? window : globalThis;
  if (globalScope.chrome && !globalScope.__MCP_FORCE_CHROME_STUB__) {
    return;
  }

  const FIXED_NOW_MS = Date.parse('2026-01-20T15:00:00.000Z');
  if (!globalScope.__MCP_DETERMINISTIC_ENV__) {
    const NativeDate = Date;
    function FixedDate(...args) {
      if (!(this instanceof FixedDate)) {
        if (args.length === 0) {
          return NativeDate(FIXED_NOW_MS).toString();
        }
        return NativeDate(...args);
      }
      if (args.length === 0) {
        return new NativeDate(FIXED_NOW_MS);
      }
      return new NativeDate(...args);
    }
    FixedDate.UTC = NativeDate.UTC;
    FixedDate.parse = NativeDate.parse;
    FixedDate.now = () => FIXED_NOW_MS;
    FixedDate.prototype = NativeDate.prototype;
    Object.setPrototypeOf(FixedDate, NativeDate);
    globalScope.Date = FixedDate;

    let randomSeed = 0x12345678;
    globalScope.Math.random = () => {
      randomSeed = (1664525 * randomSeed + 1013904223) >>> 0;
      return randomSeed / 4294967296;
    };
    globalScope.__MCP_DETERMINISTIC_ENV__ = true;
  }

  const STORAGE_KEY = '__saul_mcp_storage__';
  const baseUrl = String(globalScope.__MCP_BASE_URL__ ?? globalScope.location.origin ?? '')
    .replace(/\/$/, '');
  let runtimeLastError = null;

  function todayKey() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function clone(value) {
    try {
      return structuredClone(value);
    } catch (_error) {
      return JSON.parse(JSON.stringify(value));
    }
  }

  function createDefaultSettings() {
    return {
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
      blockProcrastination: false,
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
      workSchedule: [
        { start: '08:00', end: '12:00' },
        { start: '14:00', end: '18:00' }
      ],
      criticalSoundEnabled: false,
      holidayAutoEnabled: false,
      holidayCountryCode: '',
      vscodeIntegrationEnabled: false,
      vscodeLocalApiUrl: 'http://127.0.0.1:3123',
      vscodePairingKey: ''
    };
  }

  function createTabSwitchBreakdown() {
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

  function createTabSwitchHourly() {
    return Array.from({ length: 24 }, (_value, hour) => ({
      hour,
      ...createTabSwitchBreakdown()
    }));
  }

  function createHourly() {
    return Array.from({ length: 24 }, (_value, hour) => {
      const productiveMs = hour >= 9 && hour <= 17 ? 25 * 60000 : 0;
      const procrastinationMs = hour >= 12 && hour <= 15 && hour % 3 === 0 ? 10 * 60000 : 0;
      const inactiveMs = hour >= 9 && hour <= 17 ? 5 * 60000 : 0;
      return {
        hour,
        productiveMs,
        procrastinationMs,
        inactiveMs,
        neutralMs: Math.max(0, 60 * 60000 - productiveMs - procrastinationMs - inactiveMs)
      };
    });
  }

  function createTimeline() {
    const base = new Date();
    base.setHours(9, 0, 0, 0);
    const entries = [
      { domain: 'github.com', category: 'productive', minutes: 45 },
      { domain: 'meet.google.com', category: 'productive', minutes: 30 },
      { domain: 'youtube.com', category: 'procrastination', minutes: 20 },
      { domain: 'docs.google.com', category: 'productive', minutes: 60 },
      { domain: 'reddit.com', category: 'procrastination', minutes: 15 }
    ];
    let cursor = base.getTime();
    return entries.map((entry) => {
      const durationMs = entry.minutes * 60000;
      const startTime = cursor;
      cursor += durationMs;
      return {
        startTime,
        endTime: cursor,
        durationMs,
        domain: entry.domain,
        category: entry.category
      };
    });
  }

  function createSampleMetrics() {
    const baseDateKey = todayKey();
    const hourly = createHourly();
    const domains = {
      'github.com': { domain: 'github.com', milliseconds: 2 * 60 * 60000, category: 'productive' },
      'docs.google.com': {
        domain: 'docs.google.com',
        milliseconds: 75 * 60000,
        category: 'productive'
      },
      'meet.google.com': { domain: 'meet.google.com', milliseconds: 40 * 60000, category: 'productive' },
      'youtube.com': { domain: 'youtube.com', milliseconds: 35 * 60000, category: 'procrastination' },
      'reddit.com': { domain: 'reddit.com', milliseconds: 20 * 60000, category: 'procrastination' },
      'notion.so': { domain: 'notion.so', milliseconds: 30 * 60000, category: 'productive' }
    };
    const tabSwitchHourly = createTabSwitchHourly().map((bucket) => ({
      ...bucket,
      productiveToProductive: bucket.hour >= 10 && bucket.hour <= 16 && bucket.hour % 2 === 0 ? 2 : 0,
      productiveToProcrastination: bucket.hour === 13 ? 1 : 0,
      procrastinationToProductive: bucket.hour === 14 ? 1 : 0
    }));
    const tabSwitches = tabSwitchHourly.reduce((total, bucket) => {
      const values = {
        productiveToProductive: bucket.productiveToProductive,
        productiveToProcrastination: bucket.productiveToProcrastination,
        productiveToNeutral: bucket.productiveToNeutral,
        procrastinationToProductive: bucket.procrastinationToProductive,
        procrastinationToProcrastination: bucket.procrastinationToProcrastination,
        procrastinationToNeutral: bucket.procrastinationToNeutral,
        neutralToProductive: bucket.neutralToProductive,
        neutralToProcrastination: bucket.neutralToProcrastination,
        neutralToNeutral: bucket.neutralToNeutral
      };
      return (
        total +
        Object.values(values).reduce((sum, value) => sum + (typeof value === 'number' ? value : 0), 0)
      );
    }, 0);

    return {
      dateKey: baseDateKey,
      productiveMs: hourly.reduce((sum, item) => sum + item.productiveMs, 0),
      procrastinationMs: hourly.reduce((sum, item) => sum + item.procrastinationMs, 0),
      inactiveMs: hourly.reduce((sum, item) => sum + item.inactiveMs, 0),
      tabSwitches,
      tabSwitchBreakdown: tabSwitchHourly.reduce(
        (acc, bucket) => {
          Object.keys(acc).forEach((key) => {
            acc[key] += bucket[key] ?? 0;
          });
          return acc;
        },
        createTabSwitchBreakdown()
      ),
      tabSwitchHourly,
      domains,
      currentIndex: 76,
      lastUpdated: Date.now(),
      hourly,
      timeline: createTimeline(),
      overtimeProductiveMs: 30 * 60000,
      windowUnfocusedMs: 10 * 60000,
      audibleProcrastinationMs: 15 * 60000,
      spaNavigations: 2,
      groupedMs: 12 * 60000,
      restoredItems: 1,
      vscodeActiveMs: 40 * 60000,
      vscodeSessions: 2,
      vscodeTimeline: [
        {
          startTime: new Date().setHours(10, 0, 0, 0),
          endTime: new Date().setHours(11, 0, 0, 0),
          durationMs: 60 * 60000,
          domain: 'VS Code (IDE)',
          category: 'productive'
        }
      ],
      vscodeSwitches: 5,
      vscodeSwitchHourly: Array.from({ length: 24 }, (_value, hour) => (hour >= 10 && hour <= 16 ? 1 : 0)),
      contextDurations: {
        work: 5 * 60 * 60000,
        personal: 20 * 60000,
        leisure: 45 * 60000,
        study: 0,
        dayOff: 0,
        vacation: 0
      },
      contextIndices: {
        work: 80,
        personal: 0,
        leisure: 45,
        study: 0,
        dayOff: 0,
        vacation: 0
      }
    };
  }

  function readState() {
    try {
      const raw = globalScope.localStorage?.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return parsed;
        }
      }
    } catch (_error) {
      // ignore parsing issues, fallback to defaults
    }
    return { storage: {} };
  }

  const state = readState();

  function persistState() {
    try {
      globalScope.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (_error) {
      // ignore persistence failures in harness context
    }
  }

  function ensureSeeded() {
    if (!state.storage) {
      state.storage = {};
    }
    if (!state.storage['sg:settings']) {
      state.storage['sg:settings'] = createDefaultSettings();
    }
    if (!state.storage['sg:metrics']) {
      state.storage['sg:metrics'] = createSampleMetrics();
    }
    persistState();
  }

  function storageGet(keys) {
    ensureSeeded();
    if (typeof keys === 'undefined') {
      return Promise.resolve(clone(state.storage));
    }
    const keyList = Array.isArray(keys)
      ? keys
      : typeof keys === 'object' && keys !== null
        ? Object.keys(keys)
        : [keys];
    const result = {};
    keyList.forEach((key) => {
      if (Object.prototype.hasOwnProperty.call(state.storage, key)) {
        result[key] = clone(state.storage[key]);
      } else if (typeof keys === 'object' && keys !== null && !Array.isArray(keys)) {
        result[key] = clone(keys[key]);
      }
    });
    return Promise.resolve(result);
  }

  function storageSet(items) {
    ensureSeeded();
    Object.entries(items ?? {}).forEach(([key, value]) => {
      state.storage[key] = clone(value);
    });
    persistState();
    return Promise.resolve();
  }

  function storageRemove(keys) {
    ensureSeeded();
    const keyList = Array.isArray(keys) ? keys : [keys];
    keyList.forEach((key) => {
      delete state.storage[key];
    });
    persistState();
    return Promise.resolve();
  }

  function storageClear() {
    state.storage = {};
    persistState();
    return Promise.resolve();
  }

  function buildFairness() {
    return {
      rule: 'normal',
      manualOverrideActive: false,
      contextMode: {
        value: 'work',
        updatedAt: Date.now()
      },
      holidayNeutral: false,
      isHolidayToday: false
    };
  }

  async function handleMessage(message) {
    ensureSeeded();
    const type = message?.type;
    switch (type) {
      case 'metrics-request': {
        return {
          ok: true,
          data: {
            metrics: clone(state.storage['sg:metrics']),
            settings: clone(state.storage['sg:settings']),
            fairness: buildFairness()
          }
        };
      }
      case 'settings-updated': {
        return { ok: true, data: { acknowledged: true } };
      }
      case 'release-notes': {
        return { ok: true, data: { dismissed: true } };
      }
      case 'clear-data': {
        state.storage['sg:metrics'] = createSampleMetrics();
        persistState();
        return { ok: true, data: clone(state.storage['sg:metrics']) };
      }
      case 'activity-ping': {
        return { ok: true };
      }
      default: {
        return { ok: false, error: `Unsupported message: ${String(type)}` };
      }
    }
  }

  function sendMessage(message, callback) {
    runtimeLastError = null;
    const promise = Promise.resolve().then(() => handleMessage(message));
    if (typeof callback === 'function') {
      promise
        .then((response) => callback(response))
        .catch((error) => {
          runtimeLastError = error;
          callback(undefined);
        });
      return undefined;
    }
    return promise;
  }

  const runtime = {
    id: 'mcp-harness',
    get lastError() {
      return runtimeLastError;
    },
    set lastError(value) {
      runtimeLastError = value;
    },
    getURL: (path = '') => {
      const normalized = String(path).replace(/^\/+/, '');
      return `${baseUrl}/${normalized}`;
    },
    getManifest: () => ({
      name: 'Saul Goodman (MCP Harness)',
      version: '0.0.0-harness',
      homepage_url: `${baseUrl}/site`
    }),
    sendMessage,
    openOptionsPage: () => {
      globalScope.location.href = `${baseUrl}/tools/mcp_quality/harness/options.html`;
    }
  };

  const tabs = {
    create: ({ url }) => {
      if (url) {
        globalScope.open(url, '_blank');
      }
    },
    getCurrent: (callback) => {
      callback?.({ id: 1, url: globalScope.location.href });
    },
    remove: (_tabId, callback) => {
      callback?.();
    }
  };

  const storage = {
    local: {
      get: storageGet,
      set: storageSet,
      remove: storageRemove,
      clear: storageClear
    }
  };

  const i18n = {
    getUILanguage: () => globalScope.navigator?.language ?? 'en-US'
  };

  globalScope.chrome = { runtime, tabs, storage, i18n };
})();
