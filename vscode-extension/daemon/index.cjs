const http = require('http');
const path = require('path');
const { mkdir, readFile, writeFile, rename, stat } = require('fs/promises');
const { buildDurations, splitDurationByDay } = require('./src/vscode-aggregation.cjs');

const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';
const PORT = normalizePort(process.env.PORT);
const PAIRING_KEY = (process.env.PAIRING_KEY ?? '').trim();

// BUG-021: Ensure PAIRING_KEY is configured
if (!PAIRING_KEY) {
  console.error('[FATAL] PAIRING_KEY environment variable is required');
  console.error('[FATAL] Set PAIRING_KEY=<your-key> before starting the daemon');
  process.exit(1);
}

const LEGACY_DATA_DIR = path.join(__dirname, 'data');
const DATA_ROOT = process.env.SAUL_DAEMON_DATA_DIR || resolveDefaultDataDir();
const DATA_DIR = path.join(DATA_ROOT, 'data');
const STATE_PATH = path.join(DATA_DIR, 'vscode-usage.json');
const VSCODE_STATE_PATH = path.join(DATA_DIR, 'vscode-tracking.json');
const MAX_BODY_BYTES = parseEnvNumber('SAUL_DAEMON_MAX_BODY_KB', 256) * 1024;
const RETENTION_DAYS = parseEnvNumber('SAUL_DAEMON_RETENTION_DAYS', 1);
const VSCODE_RETENTION_DAYS = parseEnvNumber(
  'SAUL_DAEMON_VSCODE_RETENTION_DAYS',
  RETENTION_DAYS
);
const VSCODE_GAP_MS = parseEnvNumber('SAUL_VSCODE_GAP_MINUTES', 5) * 60 * 1000;
const VSCODE_GRACE_MS = parseEnvNumber('SAUL_VSCODE_GRACE_MINUTES', 2) * 60 * 1000;
const MAX_FUTURE_DAYS = 1;

const state = {
  byKey: Object.create(null)
};
const vscodeState = {
  byKey: Object.create(null)
};
const vscodeIdIndex = new Map();

let persistChain = Promise.resolve();

function enqueuePersist(task) {
  persistChain = persistChain.then(task).catch((error) => {
    console.warn('[saul-daemon] Persist failed', error);
  });
  return persistChain;
}

async function atomicWriteJson(targetPath, snapshot) {
  await mkdir(path.dirname(targetPath), { recursive: true });
  const tmpPath = `${targetPath}.tmp`;
  await writeFile(tmpPath, JSON.stringify(snapshot, null, 2), 'utf8');
  await rename(tmpPath, targetPath);
}

async function loadState() {
  await ensureDataDir();
  try {
    const raw = await readFile(STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.byKey) {
      state.byKey = parsed.byKey;
    }
  } catch {
    state.byKey = Object.create(null);
  }
}

async function persistState() {
  await mkdir(DATA_DIR, { recursive: true });
  const snapshot = { byKey: state.byKey };
  await enqueuePersist(() => atomicWriteJson(STATE_PATH, snapshot));
}

async function loadVscodeState() {
  await ensureDataDir();
  try {
    const raw = await readFile(VSCODE_STATE_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && parsed.byKey) {
      vscodeState.byKey = parsed.byKey;
      for (const key of Object.keys(vscodeState.byKey)) {
        const entry = vscodeState.byKey[key];
        if (!entry.heartbeats || !Array.isArray(entry.heartbeats)) {
          entry.heartbeats = [];
        }
        if (!entry.durations || !Array.isArray(entry.durations)) {
          entry.durations = [];
        }
        const idSet = new Set();
        for (const heartbeat of entry.heartbeats) {
          if (heartbeat && typeof heartbeat.id === 'string') {
            idSet.add(heartbeat.id);
          }
        }
        vscodeIdIndex.set(key, idSet);
      }
    }
  } catch {
    vscodeState.byKey = Object.create(null);
  }
}

async function persistVscodeState() {
  await mkdir(DATA_DIR, { recursive: true });
  const snapshot = { byKey: vscodeState.byKey };
  await enqueuePersist(() => atomicWriteJson(VSCODE_STATE_PATH, snapshot));
}

function sendJson(req, res, status, payload) {
  const origin = getAllowedOrigin(req);
  const headers = {
    'content-type': 'application/json; charset=utf-8'
  };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify(payload));
}

function sendNoContent(req, res) {
  const origin = getAllowedOrigin(req);
  const headers = origin ? { 'access-control-allow-origin': origin } : undefined;
  res.writeHead(204, headers);
  res.end();
}

function sendError(req, res, status, message) {
  const origin = getAllowedOrigin(req);
  const headers = {
    'content-type': 'application/json; charset=utf-8'
  };
  if (origin) {
    headers['access-control-allow-origin'] = origin;
  }
  res.writeHead(status, headers);
  res.end(JSON.stringify({ error: message }));
}

function parseDateKey(input) {
  // BUG-020: Strict validation to prevent path traversal
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    // Validate that the date is actually valid
    const d = new Date(input + 'T00:00:00Z');
    if (!isNaN(d.getTime())) {
      // Additional check: ensure year is reasonable (1900-2100)
      const year = d.getUTCFullYear();
      if (year >= 1900 && year <= 2100) {
        return input;
      }
    }
  }
  const now = new Date();
  return formatDateKey(now);
}

function getDateFromTimestamp(ts) {
  const date = ts ? new Date(ts) : new Date();
  if (Number.isNaN(date.getTime())) {
    return parseDateKey();
  }
  return formatDateKey(date);
}

function formatDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function getTodayKey() {
  return formatDateKey(new Date());
}

function ensureEntry(key, dateKey) {
  if (!state.byKey[key]) {
    state.byKey[key] = Object.create(null);
  }
  const existing = state.byKey[key][dateKey];
  if (!existing) {
    state.byKey[key][dateKey] = {
      totalActiveMs: 0,
      sessions: 0,
      switches: 0,
      sessionIds: [],
      timeline: [],
      switchHourly: Array.from({ length: 24 }, () => 0),
      index: null,
      indexUpdatedAt: null
    };
    return state.byKey[key][dateKey];
  }

  const entry = existing;
  if (typeof entry.totalActiveMs !== 'number') {
    entry.totalActiveMs = 0;
  }
  if (!Array.isArray(entry.sessionIds)) {
    entry.sessionIds = [];
  }
  if (typeof entry.sessions !== 'number') {
    entry.sessions = entry.sessionIds.length ?? 0;
  }
  if (!Number.isFinite(entry.switches)) {
    entry.switches = entry.sessions ?? 0;
  }
  if (!Array.isArray(entry.switchHourly) || entry.switchHourly.length !== 24) {
    entry.switchHourly = Array.from({ length: 24 }, () => 0);
  }
  if (!Array.isArray(entry.timeline)) {
    entry.timeline = [];
  }
  if (typeof entry.index !== 'number') {
    entry.index = null;
  }
  if (typeof entry.indexUpdatedAt !== 'number') {
    entry.indexUpdatedAt = null;
  }
  return entry;
}

function ensureVscodeEntry(key) {
  if (!vscodeState.byKey[key]) {
    vscodeState.byKey[key] = {
      heartbeats: [],
      durations: []
    };
  }
  const entry = vscodeState.byKey[key];
  if (!Array.isArray(entry.heartbeats)) {
    entry.heartbeats = [];
  }
  if (!Array.isArray(entry.durations)) {
    entry.durations = [];
  }
  return entry;
}

function getVscodeIdSet(key) {
  if (!vscodeIdIndex.has(key)) {
    vscodeIdIndex.set(key, new Set());
  }
  return vscodeIdIndex.get(key);
}

function pruneOldEntries() {
  const now = Date.now();
  const cutoffPast = now - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const cutoffFuture = now + MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000;
  for (const key of Object.keys(state.byKey)) {
    const dates = state.byKey[key];
    for (const dateKey of Object.keys(dates)) {
      const timestamp = Date.parse(dateKey);
      if (
        Number.isNaN(timestamp) ||
        timestamp < cutoffPast ||
        timestamp > cutoffFuture
      ) {
        delete dates[dateKey];
      }
    }
  }
}

function pruneVscodeEntries(key) {
  const entry = vscodeState.byKey[key];
  if (!entry) {
    return;
  }
  const isKept = (ts) => {
    if (!Number.isFinite(ts)) {
      return false;
    }
    const dateKey = formatDateKey(new Date(ts));
    return isDateWithinWindowWithRetention(dateKey, VSCODE_RETENTION_DAYS);
  };
  entry.heartbeats = entry.heartbeats.filter((heartbeat) => {
    return isKept(heartbeat?.time);
  });
  entry.durations = entry.durations.filter((duration) => {
    const ts = duration?.endTime ?? duration?.startTime;
    return isKept(ts);
  });
  const idSet = getVscodeIdSet(key);
  idSet.clear();
  for (const heartbeat of entry.heartbeats) {
    if (heartbeat && typeof heartbeat.id === 'string') {
      idSet.add(heartbeat.id);
    }
  }
}

function validateKey(receivedKey) {
  const cleaned = (receivedKey ?? '').trim();
  if (!cleaned) {
    return false;
  }
  return cleaned === PAIRING_KEY;
}

function normalizeHeartbeat(raw) {
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const time = coerceTimestamp(raw.time ?? raw.timestamp);
  if (!isDateWithinWindowWithRetention(formatDateKey(new Date(time)), VSCODE_RETENTION_DAYS)) {
    return null;
  }
  const entityType = coerceString(raw.entityType, 'file');
  const category = coerceString(raw.category, 'coding');
  return {
    id: coerceString(raw.id, createHeartbeatId(time)),
    time,
    entityType,
    entity: coerceString(raw.entity, 'unknown'),
    project: coerceString(raw.project, ''),
    language: coerceString(raw.language, ''),
    category,
    isWrite: Boolean(raw.isWrite),
    editor: coerceString(raw.editor, 'vscode'),
    pluginVersion: coerceString(raw.pluginVersion, ''),
    machineId: coerceString(raw.machineId, 'unknown'),
    metadata: normalizeMetadata(raw.metadata)
  };
}

function normalizeMetadata(metadata) {
  if (!metadata || typeof metadata !== 'object') {
    return {};
  }
  const normalized = {};
  if (Number.isFinite(Number(metadata.linesAdded))) {
    normalized.linesAdded = Number(metadata.linesAdded);
  }
  if (Number.isFinite(Number(metadata.linesDeleted))) {
    normalized.linesDeleted = Number(metadata.linesDeleted);
  }
  if (Number.isFinite(Number(metadata.linesRemoved))) {
    normalized.linesRemoved = Number(metadata.linesRemoved);
  }
  if (Number.isFinite(Number(metadata.filesChanged))) {
    normalized.filesChanged = Number(metadata.filesChanged);
  }
  if (Number.isFinite(Number(metadata.durationMs))) {
    normalized.durationMs = Number(metadata.durationMs);
  }
  if (Number.isFinite(Number(metadata.focusDurationMs))) {
    normalized.focusDurationMs = Number(metadata.focusDurationMs);
  }
  if (Number.isFinite(Number(metadata.previousBlurDurationMs))) {
    normalized.previousBlurDurationMs = Number(metadata.previousBlurDurationMs);
  }
  if (Number.isFinite(Number(metadata.hourOfDay))) {
    normalized.hourOfDay = Number(metadata.hourOfDay);
  }
  if (Number.isFinite(Number(metadata.count))) {
    normalized.count = Number(metadata.count);
  }
  if (Number.isFinite(Number(metadata.entryCount))) {
    normalized.entryCount = Number(metadata.entryCount);
  }
  if (Number.isFinite(Number(metadata.passed))) {
    normalized.passed = Number(metadata.passed);
  }
  if (Number.isFinite(Number(metadata.failed))) {
    normalized.failed = Number(metadata.failed);
  }
  if (Number.isFinite(Number(metadata.skipped))) {
    normalized.skipped = Number(metadata.skipped);
  }
  if (Number.isFinite(Number(metadata.errors))) {
    normalized.errors = Number(metadata.errors);
  }
  if (Number.isFinite(Number(metadata.warnings))) {
    normalized.warnings = Number(metadata.warnings);
  }
  if (Number.isFinite(Number(metadata.exitCode))) {
    normalized.exitCode = Number(metadata.exitCode);
  }
  if (Number.isFinite(Number(metadata.extensionsCount))) {
    normalized.extensionsCount = Number(metadata.extensionsCount);
  }
  if (Number.isFinite(Number(metadata.totalCommands))) {
    normalized.totalCommands = Number(metadata.totalCommands);
  }
  if (Number.isFinite(Number(metadata.topCommandCount))) {
    normalized.topCommandCount = Number(metadata.topCommandCount);
  }
  if (typeof metadata.topCommand === 'string') {
    normalized.topCommand = metadata.topCommand;
  }
  if (typeof metadata.debugType === 'string') {
    normalized.debugType = metadata.debugType;
  }
  if (typeof metadata.fileId === 'string') {
    normalized.fileId = metadata.fileId;
  }
  if (typeof metadata.commandCategory === 'string') {
    normalized.commandCategory = metadata.commandCategory;
  }
  if (typeof metadata.shellType === 'string') {
    normalized.shellType = metadata.shellType;
  }
  if (typeof metadata.taskName === 'string') {
    normalized.taskName = metadata.taskName;
  }
  if (typeof metadata.taskGroup === 'string') {
    normalized.taskGroup = metadata.taskGroup;
  }
  if (typeof metadata.source === 'string') {
    normalized.source = metadata.source;
  }
  if (typeof metadata.extensionId === 'string') {
    normalized.extensionId = metadata.extensionId;
  }
  if (typeof metadata.workspaceName === 'string') {
    normalized.workspaceName = metadata.workspaceName;
  }
  if (Number.isFinite(Number(metadata.totalFiles))) {
    normalized.totalFiles = Number(metadata.totalFiles);
  }
  if (Number.isFinite(Number(metadata.totalSizeBytes))) {
    normalized.totalSizeBytes = Number(metadata.totalSizeBytes);
  }
  if (typeof metadata.themeKind === 'string') {
    normalized.themeKind = metadata.themeKind;
  }
  if (typeof metadata.workspaceType === 'string') {
    normalized.workspaceType = metadata.workspaceType;
  }
  if (Number.isFinite(Number(metadata.linesAdded))) {
    normalized.linesAdded = Number(metadata.linesAdded);
  }
  if (Number.isFinite(Number(metadata.linesDeleted))) {
    normalized.linesDeleted = Number(metadata.linesDeleted);
  }
  if (typeof metadata.branch === 'string') {
    normalized.branch = metadata.branch;
  }
  if (typeof metadata.commandId === 'string') {
    normalized.commandId = metadata.commandId;
  }
  if (typeof metadata.vscodeVersion === 'string') {
    normalized.vscodeVersion = metadata.vscodeVersion;
  }
  if (typeof metadata.vscodeLanguage === 'string') {
    normalized.vscodeLanguage = metadata.vscodeLanguage;
  }
  if (Number.isFinite(Number(metadata.extensionsEnabled))) {
    normalized.extensionsEnabled = Number(metadata.extensionsEnabled);
  }
  if (Number.isFinite(Number(metadata.extensionsDisabled))) {
    normalized.extensionsDisabled = Number(metadata.extensionsDisabled);
  }
  if (typeof metadata.themeName === 'string') {
    normalized.themeName = metadata.themeName;
  }
  if (typeof metadata.settingsAutoSave === 'string') {
    normalized.settingsAutoSave = metadata.settingsAutoSave;
  }
  if (typeof metadata.settingsFormatOnSave === 'boolean') {
    normalized.settingsFormatOnSave = metadata.settingsFormatOnSave;
  }
  if (Number.isFinite(Number(metadata.totalDirectories))) {
    normalized.totalDirectories = Number(metadata.totalDirectories);
  }
  if (Array.isArray(metadata.largestFiles)) {
    normalized.largestFiles = metadata.largestFiles;
  }
  if (Number.isFinite(Number(metadata.currentLevel))) {
    normalized.currentLevel = Number(metadata.currentLevel);
  }
  if (Number.isFinite(Number(metadata.consecutivePomodoros))) {
    normalized.consecutivePomodoros = Number(metadata.consecutivePomodoros);
  }
  if (Number.isFinite(Number(metadata.maxComboToday))) {
    normalized.maxComboToday = Number(metadata.maxComboToday);
  }
  if (Number.isFinite(Number(metadata.totalCombosToday))) {
    normalized.totalCombosToday = Number(metadata.totalCombosToday);
  }
  if (Number.isFinite(Number(metadata.lifetimeMaxCombo))) {
    normalized.lifetimeMaxCombo = Number(metadata.lifetimeMaxCombo);
  }
  if (Number.isFinite(Number(metadata.totalMinutes))) {
    normalized.totalMinutes = Number(metadata.totalMinutes);
  }
  if (Array.isArray(metadata.comboTimeline)) {
    normalized.comboTimeline = metadata.comboTimeline;
  }
  
  return normalized;
}

function coerceTimestamp(value) {
  if (Number.isFinite(value)) {
    return Number(value);
  }
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return numeric;
    }
  }
  return Date.now();
}

function coerceString(value, fallback) {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length > 0) {
      return trimmed;
    }
  }
  return fallback;
}

function createHeartbeatId(seed) {
  return `hb-${seed}-${Math.random().toString(16).slice(2, 8)}`;
}

async function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error('Payload too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(payload);
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
  });
}

function handleOptions(req, res) {
  const origin = getAllowedOrigin(req);
  if (!origin) {
    res.writeHead(204);
    res.end();
    return;
  }
  res.writeHead(204, {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type'
  });
  res.end();
}

async function handleHeartbeat(req, res, url) {
  try {
    const body = await readJsonBody(req);
    const key = body.key ?? url.searchParams.get('key');
    if (!validateKey(key)) {
      sendError(req, res, 401, 'Invalid key');
      return;
    }

    const durationMs = Number(body.durationMs ?? 0);
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    const timestamp = body.timestamp;

    if (!sessionId) {
      sendError(req, res, 400, 'sessionId is required');
      return;
    }
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      sendError(req, res, 400, 'durationMs must be > 0');
      return;
    }

    const dateKey = getDateFromTimestamp(timestamp);
    if (!isDateWithinWindow(dateKey)) {
      sendError(req, res, 400, 'date out of allowed window');
      return;
    }
    const entry = ensureEntry(key, dateKey);

    entry.totalActiveMs += durationMs;
    const isNewSession = !entry.sessionIds.includes(sessionId);
    if (isNewSession) {
      entry.sessionIds.push(sessionId);
      entry.sessions = (entry.sessions ?? 0) + 1;
      entry.switches = Number.isFinite(entry.switches) ? entry.switches + 1 : 1;
      const hour = new Date(timestamp ?? Date.now()).getHours();
      if (Array.isArray(entry.switchHourly) && entry.switchHourly[hour] !== undefined) {
        entry.switchHourly[hour] = (entry.switchHourly[hour] ?? 0) + 1;
      }
    }
    const end = timestamp ?? Date.now();
    const start = end - durationMs;
    entry.timeline.push({
      startTime: start,
      endTime: end,
      durationMs
    });
    if (entry.timeline.length > 2000) {
      entry.timeline.splice(0, entry.timeline.length - 2000);
    }

    pruneOldEntries();
    await persistState();
    sendNoContent(req, res);
  } catch (error) {
    sendError(req, res, 400, error.message);
  }
}

function handleSummary(req, res, url) {
  const dateKey = parseDateKey(url.searchParams.get('date'));
  const key = url.searchParams.get('key') ?? '';

  if (!validateKey(key)) {
    sendError(req, res, 401, 'Invalid key');
    return;
  }

  if (!isDateWithinWindow(dateKey)) {
    sendError(req, res, 400, 'date out of allowed window');
    return;
  }

  const vscodeEntry = vscodeState.byKey[key];
  if (vscodeEntry && Array.isArray(vscodeEntry.durations) && vscodeEntry.durations.length > 0) {
    const startMs = getDayStartMs(dateKey);
    const endMs = getDayEndMsExclusive(dateKey);
    const timeline = [];
    const switchHourly = Array.from({ length: 24 }, () => 0);
    let totalActiveMs = 0;
    let sessions = 0;
    for (const duration of vscodeEntry.durations) {
      if (duration.endTime <= startMs || duration.startTime >= endMs) {
        continue;
      }
      
      // BUG-FIX: Filter out focus/blur events without valid project/language
      // Must match the filtering logic used in summarizeDurationsByDay/summarizeDurations
      const project = (duration.project ?? '').trim();
      const language = (duration.language ?? '').trim();
      
      if (!project || project.toLowerCase() === 'unknown' || !language || language.toLowerCase() === 'unknown') {
        continue;
      }
      
      sessions += 1;
      const hour = new Date(duration.startTime).getHours();
      if (switchHourly[hour] !== undefined) {
        switchHourly[hour] += 1;
      }
      const slices = splitDurationByDay(duration, startMs, endMs);
      for (const slice of slices) {
        totalActiveMs += slice.durationMs;
        timeline.push({
          startTime: slice.startTime,
          endTime: slice.endTime,
          durationMs: slice.durationMs
        });
      }
    }
    timeline.sort((a, b) => a.startTime - b.startTime);
    
    // BUG-FIX: Apply guardrails to prevent impossible metrics
    const MAX_DAY_MS = 24 * 60 * 60 * 1000; // 24 hours
    const MAX_SESSIONS_PER_DAY = 5000; // Reasonable upper limit (increased from 500 - normal workday generates 600-1000)
    
    if (totalActiveMs > MAX_DAY_MS) {
      console.warn(`[saul-daemon] WARNING: totalActiveMs (${totalActiveMs}ms = ${(totalActiveMs / 3600000).toFixed(1)}h) exceeds 24h for ${dateKey}, clamping to 24h`);
      totalActiveMs = MAX_DAY_MS;
    }
    
    if (sessions > MAX_SESSIONS_PER_DAY) {
      console.warn(`[saul-daemon] WARNING: sessions (${sessions}) exceeds reasonable limit for ${dateKey}, clamping to ${MAX_SESSIONS_PER_DAY}`);
      sessions = MAX_SESSIONS_PER_DAY;
    }
    
    sendJson(req, res, 200, {
      totalActiveMs,
      sessions,
      switches: sessions,
      switchHourly,
      timeline,
      index: null,
      indexUpdatedAt: null
    });
    return;
  }

  const hasEntry = Boolean(state.byKey[key]?.[dateKey]);
  const entry = hasEntry
    ? ensureEntry(key, dateKey)
    : {
        totalActiveMs: 0,
        sessions: 0,
        switches: 0,
        sessionIds: [],
        timeline: [],
        switchHourly: Array.from({ length: 24 }, () => 0)
      };
  const switches = Number.isFinite(entry.switches) ? entry.switches : entry.sessions ?? 0;
  const switchHourly =
    Array.isArray(entry.switchHourly) && entry.switchHourly.length === 24
      ? entry.switchHourly
      : Array.from({ length: 24 }, () => 0);
  sendJson(req, res, 200, {
    totalActiveMs: entry.totalActiveMs ?? 0,
    sessions: entry.sessions ?? 0,
    switches,
    switchHourly,
    timeline: Array.isArray(entry.timeline) ? entry.timeline : [],
    index: typeof entry.index === 'number' ? entry.index : null,
    indexUpdatedAt: typeof entry.indexUpdatedAt === 'number' ? entry.indexUpdatedAt : null
  });
}

async function handleIndex(req, res, url) {
  const method = req.method ?? 'GET';
  const keyFromQuery = url.searchParams.get('key') ?? '';

  if (method === 'GET') {
    if (!validateKey(keyFromQuery)) {
      sendError(req, res, 401, 'Invalid key');
      return;
    }
    const dateKey = parseDateKey(url.searchParams.get('date'));
    if (!isDateWithinWindow(dateKey)) {
      sendError(req, res, 400, 'date out of allowed window');
      return;
    }
    const entry = ensureEntry(keyFromQuery, dateKey);
    sendJson(req, res, 200, {
      index: typeof entry.index === 'number' ? entry.index : null,
      updatedAt: typeof entry.indexUpdatedAt === 'number' ? entry.indexUpdatedAt : null,
      productiveMs: entry.totalActiveMs ?? 0,
      sessions: entry.sessions ?? 0
    });
    return;
  }

  if (method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const key = body.key ?? keyFromQuery;
      if (!validateKey(key)) {
        sendError(req, res, 401, 'Invalid key');
        return;
      }
      const indexValue = Number(body.index);
      if (!Number.isFinite(indexValue)) {
        sendError(req, res, 400, 'index must be a number');
        return;
      }
      const timestamp = Number(body.updatedAt ?? Date.now());
      const dateKey = parseDateKey(body.date ?? url.searchParams.get('date'));
      if (!isDateWithinWindow(dateKey)) {
        sendError(req, res, 400, 'date out of allowed window');
        return;
      }
      const entry = ensureEntry(key, dateKey);
      entry.index = indexValue;
      entry.indexUpdatedAt = Number.isFinite(timestamp) ? timestamp : Date.now();
      await persistState();
      sendNoContent(req, res);
    } catch (error) {
      sendError(req, res, 400, error.message ?? 'Invalid payload');
    }
    return;
  }

  sendError(req, res, 405, 'Method not allowed');
}

async function handleVscodeHeartbeats(req, res, url) {
  try {
    const body = await readJsonBody(req);
    const key = body.key ?? url.searchParams.get('key');
    if (!validateKey(key)) {
      sendError(req, res, 401, 'Invalid key');
      return;
    }
    const payload = Array.isArray(body.heartbeats)
      ? body.heartbeats
      : Array.isArray(body.data)
        ? body.data
        : Array.isArray(body.heartbeat)
          ? body.heartbeat
          : body.heartbeat
            ? [body.heartbeat]
            : [];
    if (!payload.length) {
      sendError(req, res, 400, 'heartbeats array is required');
      return;
    }
    const entry = ensureVscodeEntry(key);
    const idSet = getVscodeIdSet(key);
    const normalized = payload
      .map((heartbeat) => normalizeHeartbeat(heartbeat))
      .filter(Boolean);
    const accepted = [];
    for (const heartbeat of normalized) {
      if (idSet.has(heartbeat.id)) {
        continue;
      }
      idSet.add(heartbeat.id);
      accepted.push(heartbeat);
    }
    if (accepted.length) {
      entry.heartbeats.push(...accepted);
      pruneVscodeEntries(key);
      entry.durations = buildDurations(entry.heartbeats, {
        gapMs: VSCODE_GAP_MS,
        graceMs: Math.min(VSCODE_GRACE_MS, VSCODE_GAP_MS)
      });
      await persistVscodeState();
    }
    sendJson(req, res, 200, {
      accepted: accepted.length,
      total: entry.heartbeats.length
    });
  } catch (error) {
    sendError(req, res, 400, error.message ?? 'Invalid payload');
  }
}

function handleVscodeHeartbeatsGet(req, res, url) {
  const key = url.searchParams.get('key') ?? '';
  if (!validateKey(key)) {
    sendError(req, res, 401, 'Invalid key');
    return;
  }
  const { startKey, endKey, startMs, endMs, timezone } = resolveDateRange(url);
  const filters = readVscodeFilters(url);
  const entry = ensureVscodeEntry(key);
  const filtered = entry.heartbeats.filter((heartbeat) => {
    if (!heartbeat || !Number.isFinite(heartbeat.time)) {
      return false;
    }
    if (heartbeat.time < startMs || heartbeat.time >= endMs) {
      return false;
    }
    return matchesFilters(heartbeat, filters);
  });
  const { page, perPage } = resolvePagination(url);
  const startIdx = (page - 1) * perPage;
  const data = filtered
    .slice(startIdx, startIdx + perPage)
    .map((heartbeat) => ({
      id: heartbeat.id,
      time: new Date(heartbeat.time).toISOString(),
      entityType: heartbeat.entityType,
      entity: heartbeat.entity,
      project: heartbeat.project,
      language: heartbeat.language,
      category: heartbeat.category,
      isWrite: heartbeat.isWrite,
      editor: heartbeat.editor,
      pluginVersion: heartbeat.pluginVersion,
      machineId: heartbeat.machineId,
      metadata: heartbeat.metadata
    }));
  sendJson(req, res, 200, {
    version: 1,
    range: { start: startKey, end: endKey, timezone },
    pagination: { page, perPage, total: filtered.length },
    data
  });
}

function handleVscodeDurations(req, res, url) {
  const key = url.searchParams.get('key') ?? '';
  if (!validateKey(key)) {
    sendError(req, res, 401, 'Invalid key');
    return;
  }
  const { startKey, endKey, startMs, endMs, timezone } = resolveDateRange(url);
  const filters = readVscodeFilters(url);
  const entry = ensureVscodeEntry(key);
  const durations = entry.durations.filter((duration) =>
    matchesDurationFilters(duration, filters, startMs, endMs)
  );
  const { page, perPage } = resolvePagination(url);
  const startIdx = (page - 1) * perPage;
  const data = durations.slice(startIdx, startIdx + perPage).map((duration) => ({
    id: duration.id,
    start: new Date(duration.startTime).toISOString(),
    end: new Date(duration.endTime).toISOString(),
    duration_seconds: Math.round(duration.durationMs / 1000),
    entityType: duration.entityType,
    entity: duration.entity,
    project: duration.project,
    language: duration.language,
    category: duration.category,
    isWrite: duration.isWrite,
    editor: duration.editor,
    machineId: duration.machineId,
    metadata: duration.metadata
  }));
  sendJson(req, res, 200, {
    version: 1,
    range: { start: startKey, end: endKey, timezone },
    pagination: { page, perPage, total: durations.length },
    data
  });
}

function handleVscodeSummaries(req, res, url) {
  const key = url.searchParams.get('key') ?? '';
  if (!validateKey(key)) {
    sendError(req, res, 401, 'Invalid key');
    return;
  }
  const { startKey, endKey, startMs, endMs, timezone } = resolveDateRange(url);
  const filters = readVscodeFilters(url);
  const entry = ensureVscodeEntry(key);
  const daily = summarizeDurationsByDay(entry.durations, startMs, endMs, filters);
  const days = Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date));
  const totalMs = days.reduce((acc, day) => acc + day.totalMs, 0);
  sendJson(req, res, 200, {
    version: 1,
    range: { start: startKey, end: endKey, timezone },
    data: {
      total_seconds: Math.round(totalMs / 1000),
      human_readable_total: formatDurationMs(totalMs),
      days: days.map((day) => ({
        date: day.date,
        total_seconds: Math.round(day.totalMs / 1000),
        projects: buildBreakdown(day.projects, day.totalMs),
        languages: buildBreakdown(day.languages, day.totalMs),
        editors: buildBreakdown(day.editors, day.totalMs),
        categories: buildBreakdown(day.categories, day.totalMs),
        machines: buildBreakdown(day.machines, day.totalMs)
      }))
    }
  });
}

function handleVscodeStatsToday(req, res, url) {
  const key = url.searchParams.get('key') ?? '';
  if (!validateKey(key)) {
    sendError(req, res, 401, 'Invalid key');
    return;
  }
  const { startKey, endKey, startMs, endMs, timezone } = resolveDateRange(url);
  const filters = readVscodeFilters(url);
  const entry = ensureVscodeEntry(key);
  const summary = summarizeDurations(entry.durations, startMs, endMs, filters);
  sendJson(req, res, 200, {
    version: 1,
    range: { start: startKey, end: endKey, timezone },
    data: {
      total_seconds: Math.round(summary.totalMs / 1000),
      human_readable_total: formatDurationMs(summary.totalMs),
      projects: buildBreakdown(summary.projects, summary.totalMs),
      languages: buildBreakdown(summary.languages, summary.totalMs),
      editors: buildBreakdown(summary.editors, summary.totalMs),
      categories: buildBreakdown(summary.categories, summary.totalMs),
      machines: buildBreakdown(summary.machines, summary.totalMs)
    }
  });
}

function handleVscodeProjects(req, res, url) {
  handleVscodeBreakdown(req, res, url, 'projects');
}

function handleVscodeLanguages(req, res, url) {
  handleVscodeBreakdown(req, res, url, 'languages');
}

function handleVscodeBreakdown(req, res, url, type) {
  const key = url.searchParams.get('key') ?? '';
  if (!validateKey(key)) {
    sendError(req, res, 401, 'Invalid key');
    return;
  }
  const { startKey, endKey, startMs, endMs, timezone } = resolveDateRange(url);
  const filters = readVscodeFilters(url);
  const entry = ensureVscodeEntry(key);
  const summary = summarizeDurations(entry.durations, startMs, endMs, filters);
  const map = summary[type];
  sendJson(req, res, 200, {
    version: 1,
    range: { start: startKey, end: endKey, timezone },
    data: buildBreakdown(map, summary.totalMs)
  });
}

function handleVscodeEditors(req, res, url) {
  handleVscodeBreakdown(req, res, url, 'editors');
}

function handleVscodeMachines(req, res, url) {
  handleVscodeBreakdown(req, res, url, 'machines');
}

function handleVscodeCommits(req, res, url) {
  const key = url.searchParams.get('key') ?? '';
  if (!validateKey(key)) {
    sendError(req, res, 401, 'Invalid key');
    return;
  }
  const { startMs, endMs } = resolveDateRange(url);
  const filters = readVscodeFilters(url);
  const entry = ensureVscodeEntry(key);

  const commits = entry.heartbeats
    .filter((hb) => hb.entityType === 'commit' && hb.time >= startMs && hb.time < endMs)
    .filter((hb) => matchesFilters(hb, filters))
    .map((hb) => ({
      time: new Date(hb.time).toISOString(),
      entity: hb.entity,
      branch: hb.metadata?.branch || 'unknown',
      message: hb.metadata?.commitMessage || '',
      remote: hb.metadata?.remote || ''
    }))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  sendJson(req, res, 200, { data: commits });
}

function handleVscodeBranches(req, res, url) {
  const key = url.searchParams.get('key') ?? '';
  if (!validateKey(key)) {
    sendError(req, res, 401, 'Invalid key');
    return;
  }
  const { startMs, endMs } = resolveDateRange(url);
  const filters = readVscodeFilters(url);
  const entry = ensureVscodeEntry(key);

  const branchMap = new Map();
  entry.durations
    .filter((dur) => matchesDurationFilters(dur, filters, startMs, endMs))
    .forEach((dur) => {
      const project = (dur.project ?? '').trim();
      const language = (dur.language ?? '').trim();
      
      if (!project || project.toLowerCase() === 'unknown' || !language || language.toLowerCase() === 'unknown') {
        return;
      }
      
      const branch = (dur.metadata?.branch ?? '').trim();
      if (!branch || branch.toLowerCase() === 'unknown') {
        return;
      }
      
      const overlapStart = Math.max(dur.startTime, startMs);
      const overlapEnd = Math.min(dur.endTime, endMs);
      const overlapMs = Math.max(0, overlapEnd - overlapStart);
      incrementMap(branchMap, branch, overlapMs);
    });

  const totalMs = Array.from(branchMap.values()).reduce((sum, ms) => sum + ms, 0);
  const data = buildBreakdown(branchMap, totalMs);
  sendJson(req, res, 200, { data });
}

function handleVscodeRepositories(req, res, url) {
  const key = url.searchParams.get('key') ?? '';
  if (!validateKey(key)) {
    sendError(req, res, 401, 'Invalid key');
    return;
  }
  const { startMs, endMs } = resolveDateRange(url);
  const filters = readVscodeFilters(url);
  const entry = ensureVscodeEntry(key);

  const repoMap = new Map();
  entry.heartbeats
    .filter((hb) => hb.entityType === 'repository' && hb.time >= startMs && hb.time < endMs)
    .filter((hb) => matchesFilters(hb, filters))
    .forEach((hb) => {
      const repo = hb.entity || 'unknown';
      const data = repoMap.get(repo) || {
        name: repo,
        branches: new Set(),
        remotes: new Set(),
        commits: 0,
        lastActivity: hb.time
      };
      if (hb.metadata?.branch) data.branches.add(hb.metadata.branch);
      if (hb.metadata?.remote) data.remotes.add(hb.metadata.remote);
      if (hb.metadata?.eventType === 'commit_created') data.commits++;
      data.lastActivity = Math.max(data.lastActivity, hb.time);
      repoMap.set(repo, data);
    });

  const data = Array.from(repoMap.values()).map((repo) => ({
    name: repo.name,
    branches: Array.from(repo.branches),
    remotes: Array.from(repo.remotes),
    commits: repo.commits,
    lastActivity: new Date(repo.lastActivity).toISOString()
  }));

  sendJson(req, res, 200, { data });
}

function handleVscodeEditorMetadata(req, res, url) {
  const key = url.searchParams.get('key') ?? '';
  if (!validateKey(key)) {
    sendError(req, res, 401, 'Invalid key');
    return;
  }
  const { startMs, endMs } = resolveDateRange(url);
  const entry = ensureVscodeEntry(key);

  const metadataSnapshots = entry.heartbeats
    .filter((hb) => hb.entityType === 'editor_metadata' && hb.time >= startMs && hb.time < endMs)
    .map((hb) => ({
      time: new Date(hb.time).toISOString(),
      vscodeVersion: hb.metadata?.vscodeVersion || 'unknown',
      uiKind: hb.metadata?.vscodeUIKind || 'unknown',
      remoteName: hb.metadata?.vscodeRemoteName || '',
      extensionsCount: hb.metadata?.extensionsCount || 0,
      extensionsEnabled: hb.metadata?.extensionsEnabled || 0,
      topExtensions: hb.metadata?.topExtensions || [],
      themeKind: hb.metadata?.themeKind || 'unknown',
      settingsAutoSave: hb.metadata?.settingsAutoSave || 'off',
      settingsFormatOnSave: hb.metadata?.settingsFormatOnSave || false,
      settingsFontSize: hb.metadata?.settingsFontSize || 14,
      workspaceFolders: hb.metadata?.workspaceFolders || 0,
      workspaceType: hb.metadata?.workspaceType || 'empty'
    }))
    .sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

  const latest = metadataSnapshots[0] || null;

  sendJson(req, res, 200, {
    data: {
      latest,
      history: metadataSnapshots.slice(0, 10)
    }
  });
}

function handleVscodeWorkspaces(req, res, url) {
  const key = url.searchParams.get('key') ?? '';
  if (!validateKey(key)) {
    sendError(req, res, 401, 'Invalid key');
    return;
  }
  const { startMs, endMs } = resolveDateRange(url);
  const entry = ensureVscodeEntry(key);

  const workspaceMap = new Map();

  entry.heartbeats
    .filter((hb) => hb.entityType === 'workspace' && hb.time >= startMs && hb.time < endMs)
    .forEach((hb) => {
      const wsPath = hb.entity || 'unknown';
      const existing = workspaceMap.get(wsPath) || {
        name: hb.metadata?.workspaceName || 'unknown',
        path: wsPath,
        totalFiles: 0,
        totalSizeBytes: 0,
        topExtensions: [],
        lastScan: hb.time
      };

      if (hb.time > existing.lastScan) {
        existing.totalFiles = hb.metadata?.totalFiles || 0;
        existing.totalSizeBytes = hb.metadata?.totalSizeBytes || 0;
        existing.topExtensions = hb.metadata?.topExtensions || [];
        existing.lastScan = hb.time;
      }

      workspaceMap.set(wsPath, existing);
    });

  const data = Array.from(workspaceMap.values()).map((ws) => ({
    name: ws.name,
    path: ws.path,
    totalFiles: ws.totalFiles,
    totalSizeBytes: ws.totalSizeBytes,
    totalSizeMB: (ws.totalSizeBytes / (1024 * 1024)).toFixed(2),
    topExtensions: ws.topExtensions,
    lastScan: new Date(ws.lastScan).toISOString()
  }));

  sendJson(req, res, 200, { data });
}

function handleVscodeActivityInsights(req, res, url) {
  const key = url.searchParams.get('key') ?? '';
  if (!validateKey(key)) {
    sendError(req, res, 401, 'Invalid key');
    return;
  }
  const { startMs, endMs } = resolveDateRange(url);
  const entry = ensureVscodeEntry(key);

  let totalTabSwitches = 0;
  let totalCommandExecutions = 0;
  const commandFrequency = new Map();
  const activitySummaries = [];

  entry.heartbeats
    .filter((hb) => hb.time >= startMs && hb.time < endMs)
    .forEach((hb) => {
      if (hb.entityType === 'tab_switch') {
        totalTabSwitches++;
      }

      if (hb.entityType === 'command') {
        totalCommandExecutions++;
        const cmd = hb.metadata?.commandId || hb.entity;
        commandFrequency.set(cmd, (commandFrequency.get(cmd) || 0) + 1);
      }

      if (hb.entityType === 'activity_summary') {
        activitySummaries.push({
          time: new Date(hb.time).toISOString(),
          tabSwitchCount: hb.metadata?.tabSwitchCount || 0,
          commandExecutionCount: hb.metadata?.commandExecutionCount || 0,
          topCommands: hb.metadata?.topCommands || []
        });
      }
    });

  const topCommands = Array.from(commandFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([cmd, count]) => ({ command: cmd, count }));

  sendJson(req, res, 200, {
    data: {
      totalTabSwitches,
      totalCommandExecutions,
      topCommands,
      activitySummaries: activitySummaries.slice(0, 10)
    }
  });
}

function aggregateTelemetry(heartbeats, startMs, endMs) {
  const telemetry = {
    debugging: {
      totalSessions: 0,
      totalDurationMs: 0,
      averageSessionMs: 0,
      topDebuggers: {},
      topFiles: {}
    },
    testing: {
      totalRuns: 0,
      passed: 0,
      failed: 0,
      skipped: 0,
      successRate: 0,
      totalDurationMs: 0,
      averageDurationMs: 0
    },
    tasks: {
      totalTasks: 0,
      byGroup: {
        build: { count: 0, totalDurationMs: 0, avgDurationMs: 0, failures: 0, failureRate: 0 },
        test: { count: 0, totalDurationMs: 0, avgDurationMs: 0, failures: 0, failureRate: 0 },
        other: { count: 0, totalDurationMs: 0, avgDurationMs: 0, failures: 0, failureRate: 0 }
      }
    },
    extensions: {
      mostUsed: []
    },
    terminal: {
      totalCommands: 0,
      byCategory: {},
      totalDurationMs: 0,
      avgDurationMs: 0
    },
    focus: {
      totalFocusMs: 0,
      totalBlurMs: 0,
      pomodorosCompleted: 0,
      peakHours: [],
      avgFocusSessionMs: 0,
      focusSessions: []
    },
    diagnostics: {
      topErrorFiles: [],
      totalErrors: 0,
      totalWarnings: 0,
      resolvedErrors: 0,
      fileSnapshots: {}
    },
    refactoring: {
      filesRenamed: 0,
      editsApplied: 0,
      codeActionsAvailable: 0
    },
    combo: {
      maxComboToday: 0,
      totalCombosToday: 0,
      lifetimeMaxCombo: 0,
      comboTimeline: []
    }
  };

  const filteredHeartbeats = heartbeats.filter(hb => hb.time >= startMs && hb.time < endMs);
  
  const comboHeartbeats = filteredHeartbeats.filter(hb => hb.entityType === 'combo');

  filteredHeartbeats.forEach(hb => {
    const entityType = hb.entityType;
    const metadata = hb.metadata || {};

    if (entityType === 'debug_session') {
      if (hb.entity === 'start') {
        telemetry.debugging.totalSessions++;
        
        const fileId = metadata.fileId;
        if (fileId && fileId !== 'unknown') {
          if (!telemetry.debugging.topFiles[fileId]) {
            telemetry.debugging.topFiles[fileId] = { sessions: 0, breakpoints: 0 };
          }
          telemetry.debugging.topFiles[fileId].sessions++;
        }
      } else if (hb.entity === 'stop' && metadata.durationMs) {
        telemetry.debugging.totalDurationMs += metadata.durationMs;
      }
      
      const debugType = metadata.debugType || 'unknown';
      telemetry.debugging.topDebuggers[debugType] = (telemetry.debugging.topDebuggers[debugType] || 0) + 1;
    }

    if (entityType === 'debug_breakpoint') {
      const fileId = metadata.fileId;
      if (fileId && fileId !== 'unknown') {
        if (!telemetry.debugging.topFiles[fileId]) {
          telemetry.debugging.topFiles[fileId] = { sessions: 0, breakpoints: 0 };
        }
        telemetry.debugging.topFiles[fileId].breakpoints++;
      }
    }

    if (entityType === 'test_run') {
      telemetry.testing.totalRuns++;
      telemetry.testing.passed += metadata.passed || 0;
      telemetry.testing.failed += metadata.failed || 0;
      telemetry.testing.skipped += metadata.skipped || 0;
      if (metadata.durationMs) {
        telemetry.testing.totalDurationMs += metadata.durationMs;
      }
    }

    if (entityType === 'task') {
      if (hb.entity === 'start') {
        telemetry.tasks.totalTasks++;
        const group = metadata.taskGroup || 'other';
        if (telemetry.tasks.byGroup[group]) {
          telemetry.tasks.byGroup[group].count++;
        }
      } else if (hb.entity === 'process_end' || hb.entity === 'end') {
        const group = metadata.taskGroup || 'other';
        if (telemetry.tasks.byGroup[group]) {
          if (metadata.durationMs) {
            telemetry.tasks.byGroup[group].totalDurationMs += metadata.durationMs;
          }
          if (metadata.exitCode && metadata.exitCode !== 0) {
            telemetry.tasks.byGroup[group].failures++;
          }
        }
      }
    }

    if (entityType === 'extension' && hb.entity === 'command_usage') {
      const extensionId = metadata.extensionId || 'unknown';
      const existing = telemetry.extensions.mostUsed.find(e => e.extensionId === extensionId);
      if (existing) {
        existing.commandCount += metadata.totalCommands || 0;
      } else {
        telemetry.extensions.mostUsed.push({
          extensionId,
          commandCount: metadata.totalCommands || 0
        });
      }
    }

    if (entityType === 'terminal') {
      if (hb.entity === 'command_end') {
        telemetry.terminal.totalCommands++;
        const category = metadata.commandCategory || 'other';
        telemetry.terminal.byCategory[category] = (telemetry.terminal.byCategory[category] || 0) + 1;
        if (metadata.durationMs) {
          telemetry.terminal.totalDurationMs += metadata.durationMs;
        }
      }
    }

    if (entityType === 'window') {
      if (hb.entity === 'blur' && metadata.focusDurationMs) {
        telemetry.focus.totalFocusMs += metadata.focusDurationMs;
        telemetry.focus.focusSessions.push({
          durationMs: metadata.focusDurationMs,
          hour: metadata.hourOfDay || 0
        });
      } else if (hb.entity === 'focus' && metadata.previousBlurDurationMs) {
        telemetry.focus.totalBlurMs += metadata.previousBlurDurationMs;
      } else if (hb.entity === 'pomodoro_milestone') {
        telemetry.focus.pomodorosCompleted++;
      }
    }

    if (entityType === 'diagnostic' && hb.entity === 'snapshot') {
      const fileId = metadata.fileId || 'unknown';
      const errors = metadata.errors || 0;
      const warnings = metadata.warnings || 0;
      
      telemetry.diagnostics.totalErrors += errors;
      telemetry.diagnostics.totalWarnings += warnings;

      if (!telemetry.diagnostics.fileSnapshots[fileId]) {
        telemetry.diagnostics.fileSnapshots[fileId] = { errors, warnings, lastSeen: hb.time };
      } else {
        const prev = telemetry.diagnostics.fileSnapshots[fileId];
        if (prev.errors > errors) {
          telemetry.diagnostics.resolvedErrors += (prev.errors - errors);
        }
        telemetry.diagnostics.fileSnapshots[fileId] = { errors, warnings, lastSeen: hb.time };
      }
    }

    if (entityType === 'refactor') {
      if (hb.entity === 'rename_files') {
        telemetry.refactoring.filesRenamed += metadata.count || 0;
      } else if (hb.entity === 'apply_edit') {
        telemetry.refactoring.editsApplied += metadata.entryCount || 0;
      } else if (hb.entity === 'code_action_available') {
        telemetry.refactoring.codeActionsAvailable += metadata.count || 0;
      }
    }

    if (entityType === 'combo') {
      
      // Processar TODOS os tipos de eventos de combo
      const maxComboToday = metadata.maxComboToday || 0;
      const totalCombosToday = metadata.totalCombosToday || 0;
      const lifetimeMaxCombo = metadata.lifetimeMaxCombo || 0;

      telemetry.combo.maxComboToday = Math.max(telemetry.combo.maxComboToday, maxComboToday);
      telemetry.combo.totalCombosToday = Math.max(telemetry.combo.totalCombosToday, totalCombosToday);
      telemetry.combo.lifetimeMaxCombo = Math.max(telemetry.combo.lifetimeMaxCombo, lifetimeMaxCombo);

      if (metadata.comboTimeline && Array.isArray(metadata.comboTimeline)) {
        metadata.comboTimeline.forEach(event => {
          const exists = telemetry.combo.comboTimeline.some(e => 
            e.timestamp === event.timestamp && e.type === event.type
          );
          if (!exists) {
            telemetry.combo.comboTimeline.push({
              timestamp: event.timestamp,
              type: event.type,
              level: event.level || 0,
              pomodoros: event.pomodoros || 0
            });
          }
        });
      }
    }
  });

  if (telemetry.debugging.totalSessions > 0) {
    telemetry.debugging.averageSessionMs = Math.round(telemetry.debugging.totalDurationMs / telemetry.debugging.totalSessions);
  }

  if (telemetry.testing.totalRuns > 0) {
    const totalTests = telemetry.testing.passed + telemetry.testing.failed + telemetry.testing.skipped;
    telemetry.testing.successRate = totalTests > 0 ? Math.round((telemetry.testing.passed / totalTests) * 10000) / 100 : 0;
    telemetry.testing.averageDurationMs = Math.round(telemetry.testing.totalDurationMs / telemetry.testing.totalRuns);
  }

  Object.keys(telemetry.tasks.byGroup).forEach(group => {
    const g = telemetry.tasks.byGroup[group];
    if (g.count > 0) {
      g.avgDurationMs = Math.round(g.totalDurationMs / g.count);
      g.failureRate = Math.round((g.failures / g.count) * 10000) / 100;
    }
  });

  if (telemetry.terminal.totalCommands > 0) {
    telemetry.terminal.avgDurationMs = Math.round(telemetry.terminal.totalDurationMs / telemetry.terminal.totalCommands);
  }

  telemetry.extensions.mostUsed.sort((a, b) => b.commandCount - a.commandCount);
  telemetry.extensions.mostUsed = telemetry.extensions.mostUsed.slice(0, 10);

  if (telemetry.focus.focusSessions.length > 0) {
    telemetry.focus.avgFocusSessionMs = Math.round(
      telemetry.focus.focusSessions.reduce((sum, s) => sum + s.durationMs, 0) / telemetry.focus.focusSessions.length
    );

    const hourCounts = {};
    telemetry.focus.focusSessions.forEach(s => {
      hourCounts[s.hour] = (hourCounts[s.hour] || 0) + s.durationMs;
    });
    telemetry.focus.peakHours = Object.entries(hourCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([hour]) => parseInt(hour));
  }

  telemetry.diagnostics.topErrorFiles = Object.entries(telemetry.diagnostics.fileSnapshots)
    .map(([fileId, snap]) => ({
      fileId,
      errors: snap.errors,
      warnings: snap.warnings
    }))
    .filter(f => f.errors > 0)
    .sort((a, b) => b.errors - a.errors)
    .slice(0, 10);

  const topDebuggers = Object.entries(telemetry.debugging.topDebuggers)
    .map(([type, sessions]) => ({ type, sessions }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 5);
  
  telemetry.debugging.topDebuggers = topDebuggers;

  const topFiles = Object.entries(telemetry.debugging.topFiles)
    .map(([fileId, data]) => ({ 
      fileId, 
      sessions: data.sessions || 0,
      breakpoints: data.breakpoints || 0
    }))
    .sort((a, b) => {
      const scoreA = (a.sessions * 10) + a.breakpoints;
      const scoreB = (b.sessions * 10) + b.breakpoints;
      return scoreB - scoreA;
    })
    .slice(0, 10);
  
  telemetry.debugging.topFiles = topFiles;

  delete telemetry.focus.focusSessions;
  delete telemetry.diagnostics.fileSnapshots;

  telemetry.combo.comboTimeline.sort((a, b) => a.timestamp - b.timestamp);
  telemetry.combo.comboTimeline = telemetry.combo.comboTimeline.slice(-100);

  return telemetry;
}

function handleVscodeTelemetry(req, res, url) {
  const key = url.searchParams.get('key') ?? '';
  if (!validateKey(key)) {
    sendError(req, res, 401, 'Invalid key');
    return;
  }

  const { startKey, endKey, startMs, endMs, timezone } = resolveDateRange(url);
  const entry = ensureVscodeEntry(key);

  const telemetry = aggregateTelemetry(entry.heartbeats, startMs, endMs);

  sendJson(req, res, 200, {
    version: 1,
    range: { start: startKey, end: endKey, timezone },
    data: telemetry
  });
}

function handleVscodeDashboard(req, res, url) {
  try {
    const key = url.searchParams.get('key') ?? '';
    if (!validateKey(key)) {
      sendError(req, res, 401, 'Invalid key');
      return;
    }
    const { startKey, endKey, startMs, endMs, timezone } = resolveDateRange(url);
  const filters = readVscodeFilters(url);
  const entry = ensureVscodeEntry(key);

  const summary = summarizeDurations(entry.durations, startMs, endMs, filters);
  const hourly = summarizeDurationsByHour(entry.durations, startMs, endMs, filters);
  const languagesByProject = summarizeLanguagesByProject(entry.durations, startMs, endMs, filters);

  let totalCommits = 0;
  let totalFilesChanged = 0;
  let totalLinesAdded = 0;
  let totalLinesDeleted = 0;

  const commitHeartbeats = entry.heartbeats.filter((hb) => hb.entityType === 'commit' && hb.time >= startMs && hb.time < endMs);
  
  commitHeartbeats.forEach((hb) => {
    totalCommits++;
    const files = hb.metadata?.filesChanged || 0;
    const added = hb.metadata?.linesAdded || 0;
    const deleted = hb.metadata?.linesDeleted || 0;
    
    totalFilesChanged += files;
    totalLinesAdded += added;
    totalLinesDeleted += deleted;
  });

  const branchMap = new Map();
  entry.durations
    .filter((dur) => matchesDurationFilters(dur, filters, startMs, endMs))
    .forEach((dur) => {
      const project = (dur.project ?? '').trim();
      const language = (dur.language ?? '').trim();
      
      if (!project || project.toLowerCase() === 'unknown' || !language || language.toLowerCase() === 'unknown') {
        return;
      }
      
      const branch = (dur.metadata?.branch ?? '').trim();
      if (!branch || branch.toLowerCase() === 'unknown') {
        return;
      }
      
      const overlapStart = Math.max(dur.startTime, startMs);
      const overlapEnd = Math.min(dur.endTime, endMs);
      const overlapMs = Math.max(0, overlapEnd - overlapStart);
      incrementMap(branchMap, branch, overlapMs);
    });

  const editorMetadata = entry.heartbeats
    .filter((hb) => hb.entityType === 'editor_metadata' && hb.time >= startMs && hb.time < endMs)
    .sort((a, b) => b.time - a.time)[0];

  const workspaceMap = new Map();
  entry.heartbeats
    .filter((hb) => hb.entityType === 'workspace' && hb.time >= startMs && hb.time < endMs)
    .forEach((hb) => {
      const wsPath = (hb.entity ?? '').trim();
      const wsName = (hb.metadata?.workspaceName ?? '').trim();
      
      if (!wsPath || wsPath.toLowerCase() === 'unknown' || !wsName || wsName.toLowerCase() === 'unknown') {
        return;
      }
      
      if (!workspaceMap.has(hb.entity) || hb.time > workspaceMap.get(hb.entity).time) {
        workspaceMap.set(hb.entity, {
          name: wsName,
          totalFiles: hb.metadata?.totalFiles || 0,
          totalSizeMB: ((hb.metadata?.totalSizeBytes || 0) / (1024 * 1024)).toFixed(2),
          time: hb.time
        });
      }
    });

  let totalTabSwitches = 0;
  let totalCommandExecutions = 0;
  entry.heartbeats
    .filter((hb) => hb.time >= startMs && hb.time < endMs)
    .forEach((hb) => {
      if (hb.entityType === 'tab_switch') totalTabSwitches++;
      if (hb.entityType === 'command') totalCommandExecutions++;
    });

  const chromeEntry = ensureEntry(key, startKey);
  const index = typeof chromeEntry.index === 'number' ? chromeEntry.index : null;

  sendJson(req, res, 200, {
    version: 1,
    range: { start: startKey, end: endKey, timezone },
    data: {
      overview: {
        totalSeconds: Math.round(summary.totalMs / 1000),
        humanReadableTotal: formatDurationMs(summary.totalMs),
        totalHeartbeats: entry.heartbeats.filter((hb) => hb.time >= startMs && hb.time < endMs).length,
        index
      },
      projects: buildBreakdown(summary.projects, summary.totalMs).slice(0, 10),
      languages: buildBreakdown(summary.languages, summary.totalMs).slice(0, 10),
      branches: buildBreakdown(branchMap, Array.from(branchMap.values()).reduce((sum, ms) => sum + ms, 0)).slice(0, 10),
      languagesByProject,
      hourly: hourly.map(h => ({
        hour: h.hour,
        coding: Math.round(h.codingMs / 1000),
        debugging: Math.round(h.debuggingMs / 1000),
        building: Math.round(h.buildingMs / 1000),
        testing: Math.round(h.testingMs / 1000),
        total: Math.round(h.totalMs / 1000)
      })),
      git: {
        totalCommits,
        totalFilesChanged,
        totalLinesAdded,
        totalLinesDeleted,
        topBranches: Array.from(branchMap.keys()).slice(0, 5)
      },
      editor: editorMetadata ? {
        vscodeVersion: editorMetadata.metadata?.vscodeVersion || 'unknown',
        extensionsCount: editorMetadata.metadata?.extensionsCount || 0,
        themeKind: editorMetadata.metadata?.themeKind || 'unknown',
        workspaceType: editorMetadata.metadata?.workspaceType || 'empty'
      } : null,
      workspaces: Array.from(workspaceMap.values()),
      activity: {
        totalTabSwitches,
        totalCommandExecutions
      }
    }
  });
  } catch (error) {
    console.error('[saul-daemon] Error in handleVscodeDashboard:', error);
    sendError(req, res, 500, 'Internal server error');
  }
}


function handleVscodeMeta(req, res) {
  sendJson(req, res, 200, {
    version: 1,
    data: {
      retention_days: VSCODE_RETENTION_DAYS,
      gap_minutes: Math.round(VSCODE_GAP_MS / 60000),
      grace_minutes: Math.round(Math.min(VSCODE_GRACE_MS, VSCODE_GAP_MS) / 60000)
    }
  });
}

function resolveDateRange(url) {
  const startKey = getTodayKey();
  const endKey = startKey;
  const startMs = getDayStartMs(startKey);
  const endMs = getDayEndMsExclusive(endKey);
  return {
    startKey,
    endKey,
    startMs,
    endMs,
    timezone: url.searchParams.get('tz') ?? guessTimezone()
  };
}

function guessTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  } catch {
    return 'local';
  }
}

function getDayStartMs(dateKey) {
  const [year, month, day] = dateKey.split('-').map((value) => Number(value));
  return new Date(year, month - 1, day).getTime();
}

function getDayEndMsExclusive(dateKey) {
  return getDayStartMs(dateKey) + 24 * 60 * 60 * 1000;
}

function readVscodeFilters(url) {
  return {
    project: url.searchParams.get('project') ?? '',
    language: url.searchParams.get('language') ?? '',
    editor: url.searchParams.get('editor') ?? '',
    machineId: url.searchParams.get('machine') ?? '',
    entityType: url.searchParams.get('entityType') ?? '',
    category: url.searchParams.get('category') ?? ''
  };
}

function matchesFilters(record, filters) {
  if (filters.project && record.project !== filters.project) {
    return false;
  }
  if (filters.language && record.language !== filters.language) {
    return false;
  }
  if (filters.editor && record.editor !== filters.editor) {
    return false;
  }
  if (filters.machineId && record.machineId !== filters.machineId) {
    return false;
  }
  if (filters.entityType && record.entityType !== filters.entityType) {
    return false;
  }
  if (filters.category && record.category !== filters.category) {
    return false;
  }
  return true;
}

function matchesDurationFilters(duration, filters, startMs, endMs) {
  if (!duration || !Number.isFinite(duration.startTime)) {
    return false;
  }
  if (duration.endTime <= startMs || duration.startTime >= endMs) {
    return false;
  }
  return matchesFilters(duration, filters);
}

function resolvePagination(url) {
  const perPage = Math.min(200, Math.max(1, Number(url.searchParams.get('per_page') ?? 100)));
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1));
  return { page, perPage };
}

function summarizeDurationsByDay(durations, startMs, endMs, filters) {
  const daily = new Map();
  for (const duration of durations) {
    if (!matchesDurationFilters(duration, filters, startMs, endMs)) {
      continue;
    }
    
    const project = (duration.project ?? '').trim();
    const language = (duration.language ?? '').trim();
    
    if (!project || project.toLowerCase() === 'unknown' || !language || language.toLowerCase() === 'unknown') {
      continue;
    }
    
    const slices = splitDurationByDay(duration, startMs, endMs);
    for (const slice of slices) {
      const dateKey = slice.dateKey;
      if (!daily.has(dateKey)) {
        daily.set(dateKey, {
          date: dateKey,
          totalMs: 0,
          projects: new Map(),
          languages: new Map(),
          editors: new Map(),
          categories: new Map(),
          machines: new Map()
        });
      }
      const entry = daily.get(dateKey);
      entry.totalMs += slice.durationMs;
      incrementMap(entry.projects, project, slice.durationMs);
      incrementMap(entry.languages, language, slice.durationMs);
      incrementMap(entry.editors, duration.editor ?? 'vscode', slice.durationMs);
      incrementMap(entry.categories, duration.category ?? 'coding', slice.durationMs);
      incrementMap(entry.machines, duration.machineId ?? 'unknown', slice.durationMs);
    }
  }
  return daily;
}

function summarizeDurations(durations, startMs, endMs, filters) {
  const summary = {
    totalMs: 0,
    projects: new Map(),
    languages: new Map(),
    editors: new Map(),
    categories: new Map(),
    machines: new Map()
  };
  for (const duration of durations) {
    if (!matchesDurationFilters(duration, filters, startMs, endMs)) {
      continue;
    }
    const overlapStart = Math.max(duration.startTime, startMs);
    const overlapEnd = Math.min(duration.endTime, endMs);
    const overlapMs = Math.max(0, overlapEnd - overlapStart);
    if (overlapMs <= 0) {
      continue;
    }
    
    const project = (duration.project ?? '').trim();
    const language = (duration.language ?? '').trim();
    
    if (!project || project.toLowerCase() === 'unknown' || !language || language.toLowerCase() === 'unknown') {
      continue;
    }
    
    summary.totalMs += overlapMs;
    incrementMap(summary.projects, project, overlapMs);
    incrementMap(summary.languages, language, overlapMs);
    incrementMap(summary.editors, duration.editor ?? 'vscode', overlapMs);
    incrementMap(summary.categories, duration.category ?? 'coding', overlapMs);
    incrementMap(summary.machines, duration.machineId ?? 'unknown', overlapMs);
  }
  return summary;
}

function summarizeLanguagesByProject(durations, startMs, endMs, filters) {
  const projectMap = new Map();
  
  for (const duration of durations) {
    if (!matchesDurationFilters(duration, filters, startMs, endMs)) {
      continue;
    }
    const overlapStart = Math.max(duration.startTime, startMs);
    const overlapEnd = Math.min(duration.endTime, endMs);
    const overlapMs = Math.max(0, overlapEnd - overlapStart);
    if (overlapMs <= 0) {
      continue;
    }

    const project = (duration.project ?? '').trim();
    const language = (duration.language ?? '').trim();
    
    if (!project || project.toLowerCase() === 'unknown' || !language || language.toLowerCase() === 'unknown') {
      continue;
    }

    if (!projectMap.has(project)) {
      projectMap.set(project, new Map());
    }
    
    const langMap = projectMap.get(project);
    langMap.set(language, (langMap.get(language) || 0) + overlapMs);
  }

  const result = [];
  for (const [project, langMap] of projectMap.entries()) {
    const languages = [];
    let projectTotal = 0;
    
    for (const [language, ms] of langMap.entries()) {
      languages.push({
        language,
        seconds: Math.round(ms / 1000),
        minutes: Math.round(ms / 60000)
      });
      projectTotal += ms;
    }
    
    languages.sort((a, b) => b.seconds - a.seconds);
    
    result.push({
      project,
      totalSeconds: Math.round(projectTotal / 1000),
      languages: languages.slice(0, 5)
    });
  }
  
  result.sort((a, b) => b.totalSeconds - a.totalSeconds);
  return result.slice(0, 5);
}

function summarizeDurationsByHour(durations, startMs, endMs, filters) {
  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    codingMs: 0,
    debuggingMs: 0,
    buildingMs: 0,
    testingMs: 0,
    totalMs: 0
  }));

  for (const duration of durations) {
    if (!matchesDurationFilters(duration, filters, startMs, endMs)) {
      continue;
    }
    const overlapStart = Math.max(duration.startTime, startMs);
    const overlapEnd = Math.min(duration.endTime, endMs);
    const overlapMs = Math.max(0, overlapEnd - overlapStart);
    if (overlapMs <= 0) {
      continue;
    }

    const project = (duration.project ?? '').trim();
    const language = (duration.language ?? '').trim();
    
    if (!project || project.toLowerCase() === 'unknown' || !language || language.toLowerCase() === 'unknown') {
      continue;
    }

    const startHour = new Date(overlapStart).getHours();
    const endHour = new Date(overlapEnd).getHours();
    const category = duration.category || 'coding';

    if (startHour === endHour) {
      const bucket = hourly[startHour];
      bucket.totalMs += overlapMs;
      if (category === 'coding') bucket.codingMs += overlapMs;
      else if (category === 'debugging') bucket.debuggingMs += overlapMs;
      else if (category === 'building') bucket.buildingMs += overlapMs;
      else if (category === 'testing') bucket.testingMs += overlapMs;
      else bucket.codingMs += overlapMs;
    } else {
      const startHourEnd = new Date(overlapStart);
      startHourEnd.setHours(startHour + 1, 0, 0, 0);
      const firstMs = Math.min(startHourEnd.getTime() - overlapStart, overlapMs);
      
      const firstBucket = hourly[startHour];
      firstBucket.totalMs += firstMs;
      if (category === 'coding') firstBucket.codingMs += firstMs;
      else if (category === 'debugging') firstBucket.debuggingMs += firstMs;
      else if (category === 'building') firstBucket.buildingMs += firstMs;
      else if (category === 'testing') firstBucket.testingMs += firstMs;
      else firstBucket.codingMs += firstMs;

      let remainingMs = overlapMs - firstMs;
      let currentHour = startHour + 1;

      while (currentHour <= endHour && remainingMs > 0) {
        const hourStart = new Date(overlapStart);
        hourStart.setHours(currentHour, 0, 0, 0);
        const hourEnd = new Date(hourStart);
        hourEnd.setHours(currentHour + 1, 0, 0, 0);
        
        const allocMs = currentHour === endHour 
          ? Math.min(remainingMs, overlapEnd - hourStart.getTime())
          : Math.min(remainingMs, 3600000);

        const bucket = hourly[currentHour];
        bucket.totalMs += allocMs;
        if (category === 'coding') bucket.codingMs += allocMs;
        else if (category === 'debugging') bucket.debuggingMs += allocMs;
        else if (category === 'building') bucket.buildingMs += allocMs;
        else if (category === 'testing') bucket.testingMs += allocMs;
        else bucket.codingMs += allocMs;

        remainingMs -= allocMs;
        currentHour++;
      }
    }
  }

  return hourly;
}

function incrementMap(map, key, value) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function buildBreakdown(map, totalMs) {
  const items = Array.from(map.entries()).map(([name, ms]) => ({
    name,
    total_seconds: Math.round(ms / 1000),
    percent: totalMs > 0 ? Number((ms / totalMs).toFixed(4)) : 0
  }));
  return items.sort((a, b) => b.total_seconds - a.total_seconds);
}

function formatDurationMs(ms) {
  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (hours > 0) {
    return `${hours}h`;
  }
  return `${minutes}m`;
}


async function start() {
  if (!PAIRING_KEY) {
    console.error('[saul-daemon] PAIRING_KEY is required. Set the environment variable and retry.');
    process.exit(1);
  }

  await loadState();
  await loadVscodeState();
  const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
      sendError(req, res, 400, 'Invalid request');
      return;
    }

    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
    const logUrl = new URL(parsedUrl.toString());
    if (logUrl.searchParams.has('key')) {
      logUrl.searchParams.set('key', '***');
    }
    console.log(`[saul-daemon] ${req.method} ${logUrl.pathname}${logUrl.search ? logUrl.search : ''}`);

    if (req.method === 'OPTIONS') {
      handleOptions(req, res);
      return;
    }

    if (req.method === 'GET' && (parsedUrl.pathname === '/health' || parsedUrl.pathname === '/v1/health')) {
      sendJson(req, res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/tracking/vscode/summary') {
      handleSummary(req, res, parsedUrl);
      return;
    }

    if (parsedUrl.pathname === '/v1/tracking/index') {
      await handleIndex(req, res, parsedUrl);
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/v1/tracking/vscode/heartbeat') {
      await handleHeartbeat(req, res, parsedUrl);
      return;
    }

    if (parsedUrl.pathname === '/v1/vscode/heartbeats') {
      if (req.method === 'GET') {
        handleVscodeHeartbeatsGet(req, res, parsedUrl);
        return;
      }
      if (req.method === 'POST') {
        await handleVscodeHeartbeats(req, res, parsedUrl);
        return;
      }
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/durations') {
      handleVscodeDurations(req, res, parsedUrl);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/summaries') {
      handleVscodeSummaries(req, res, parsedUrl);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/stats/today') {
      handleVscodeStatsToday(req, res, parsedUrl);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/projects') {
      handleVscodeProjects(req, res, parsedUrl);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/languages') {
      handleVscodeLanguages(req, res, parsedUrl);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/editors') {
      handleVscodeEditors(req, res, parsedUrl);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/machines') {
      handleVscodeMachines(req, res, parsedUrl);
      return;
    }


    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/meta') {
      handleVscodeMeta(req, res, parsedUrl);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/commits') {
      handleVscodeCommits(req, res, parsedUrl);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/branches') {
      handleVscodeBranches(req, res, parsedUrl);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/repositories') {
      handleVscodeRepositories(req, res, parsedUrl);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/editor-metadata') {
      handleVscodeEditorMetadata(req, res, parsedUrl);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/workspaces') {
      handleVscodeWorkspaces(req, res, parsedUrl);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/activity-insights') {
      handleVscodeActivityInsights(req, res, parsedUrl);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/telemetry') {
      handleVscodeTelemetry(req, res, parsedUrl);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/vscode/dashboard') {
      handleVscodeDashboard(req, res, parsedUrl);
      return;
    }

    sendError(req, res, 404, 'Not found');
  });

  server.listen(PORT, BIND_HOST, () => {
    console.log(`[saul-daemon] listening on http://${BIND_HOST}:${PORT}`);
  });
}

start().catch((error) => {
  console.error('Failed to start SaulDaemon', error);
  process.exit(1);
});

function getAllowedOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) {
    return null;
  }
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) {
    return origin;
  }
  if (/^chrome-extension:\/\/[a-p]{32}$/i.test(origin)) {
    return origin;
  }
  if (/^vscode-webview:\/\/.+/i.test(origin)) {
    return origin;
  }
  return null;
}

function normalizePort(value) {
  const n = Number(value ?? 3123);
  if (Number.isInteger(n) && n > 0 && n <= 65535) {
    return n;
  }
  return 3123;
}

function isDateWithinWindow(dateKey) {
  return isDateWithinWindowWithRetention(dateKey, RETENTION_DAYS);
}

function isDateWithinWindowWithRetention(dateKey, retentionDays) {
  const ts = Date.parse(dateKey);
  if (Number.isNaN(ts)) {
    return false;
  }
  const now = new Date();
  const min = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
  const max = new Date(now.getTime() + MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000);
  return ts >= Date.parse(formatDateKey(min)) && ts <= Date.parse(formatDateKey(max));
}

function parseEnvNumber(key, fallback) {
  const raw = Number(process.env[key]);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return fallback;
}

async function ensureDataDir() {
  await mkdir(DATA_DIR, { recursive: true });
  const legacyState = path.join(LEGACY_DATA_DIR, 'vscode-usage.json');
  if (STATE_PATH === legacyState) {
    return;
  }
  try {
    const legacyInfo = await stat(legacyState);
    const targetInfo = await stat(STATE_PATH).catch(() => null);
    if (legacyInfo && !targetInfo) {
      await mkdir(path.dirname(STATE_PATH), { recursive: true });
      await rename(legacyState, STATE_PATH);
    }
  } catch {
    // ignore migration errors
  }
}

function resolveDefaultDataDir() {
  if (process.env.XDG_DATA_HOME) {
    return path.join(process.env.XDG_DATA_HOME, 'saul-daemon');
  }
  if (process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'saul-daemon');
  }
  if (process.env.HOME) {
    return path.join(process.env.HOME, '.local', 'share', 'saul-daemon');
  }
  return LEGACY_DATA_DIR;
}
