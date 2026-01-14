const http = require('http');
const path = require('path');
const { mkdir, readFile, writeFile, rename, stat } = require('fs/promises');

const BIND_HOST = process.env.BIND_HOST || '127.0.0.1';
const PORT = normalizePort(process.env.PORT);
const PAIRING_KEY = (process.env.PAIRING_KEY ?? '').trim();
const LEGACY_DATA_DIR = path.join(__dirname, 'data');
const DATA_ROOT = process.env.SAUL_DAEMON_DATA_DIR || resolveDefaultDataDir();
const DATA_DIR = path.join(DATA_ROOT, 'data');
const STATE_PATH = path.join(DATA_DIR, 'vscode-usage.json');
const MAX_BODY_BYTES = 64 * 1024;
const RETENTION_DAYS = 14;
const MAX_FUTURE_DAYS = 1;

const state = {
  byKey: Object.create(null)
};

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
  await writeFile(STATE_PATH, JSON.stringify(snapshot, null, 2), 'utf8');
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
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
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

function validateKey(receivedKey) {
  const cleaned = (receivedKey ?? '').trim();
  if (!cleaned) {
    return false;
  }
  return cleaned === PAIRING_KEY;
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

async function start() {
  if (!PAIRING_KEY) {
    console.error('[saul-daemon] PAIRING_KEY is required. Set the environment variable and retry.');
    process.exit(1);
  }

  await loadState();
  const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
      sendError(req, res, 400, 'Invalid request');
      return;
    }

    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === 'OPTIONS') {
      handleOptions(req, res);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/health') {
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
  const ts = Date.parse(dateKey);
  if (Number.isNaN(ts)) {
    return false;
  }
  const now = new Date();
  const min = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  const max = new Date(now.getTime() + MAX_FUTURE_DAYS * 24 * 60 * 60 * 1000);
  return ts >= Date.parse(formatDateKey(min)) && ts <= Date.parse(formatDateKey(max));
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
