const http = require('http');
const path = require('path');
const { mkdir, readFile, writeFile } = require('fs/promises');

const PORT = Number(process.env.PORT ?? 3123);
const PAIRING_KEY = (process.env.PAIRING_KEY ?? '').trim();
const DATA_DIR = path.join(__dirname, 'data');
const STATE_PATH = path.join(DATA_DIR, 'vscode-usage.json');
const MAX_BODY_BYTES = 64 * 1024;
const RETENTION_DAYS = 14;

const state = {
  byKey: Object.create(null)
};

async function loadState() {
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

function sendJson(res, status, payload) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*'
  });
  res.end(JSON.stringify(payload));
}

function sendNoContent(res) {
  res.writeHead(204, {
    'access-control-allow-origin': '*'
  });
  res.end();
}

function sendError(res, status, message) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*'
  });
  res.end(JSON.stringify({ error: message }));
}

function parseDateKey(input) {
  if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) {
    return input;
  }
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
}

function getDateFromTimestamp(ts) {
  const date = ts ? new Date(ts) : new Date();
  if (Number.isNaN(date.getTime())) {
    return parseDateKey();
  }
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
      switchHourly: Array.from({ length: 24 }, () => 0)
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
  return entry;
}

function pruneOldEntries() {
  const cutoff = Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000;
  for (const key of Object.keys(state.byKey)) {
    const dates = state.byKey[key];
    for (const dateKey of Object.keys(dates)) {
      const timestamp = Date.parse(dateKey);
      if (Number.isNaN(timestamp) || timestamp < cutoff) {
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
  if (!PAIRING_KEY) {
    return true;
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

function handleOptions(res) {
  res.writeHead(204, {
    'access-control-allow-origin': '*',
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
    sendError(res, 401, 'Invalid key');
    return;
  }

  const durationMs = Number(body.durationMs ?? 0);
  const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
  const timestamp = body.timestamp;

    if (!sessionId) {
      sendError(res, 400, 'sessionId is required');
      return;
    }
    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      sendError(res, 400, 'durationMs must be > 0');
      return;
  }

    const dateKey = getDateFromTimestamp(timestamp);
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
    sendNoContent(res);
  } catch (error) {
    sendError(res, 400, error.message);
  }
}

function handleSummary(res, url) {
  const dateKey = parseDateKey(url.searchParams.get('date'));
  const key = url.searchParams.get('key') ?? '';

  if (!validateKey(key)) {
    sendError(res, 401, 'Invalid key');
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
  sendJson(res, 200, {
    totalActiveMs: entry.totalActiveMs ?? 0,
    sessions: entry.sessions ?? 0,
    switches,
    switchHourly,
    timeline: Array.isArray(entry.timeline) ? entry.timeline : []
  });
}

async function start() {
  await loadState();
  const server = http.createServer(async (req, res) => {
    if (!req.url || !req.method) {
      sendError(res, 400, 'Invalid request');
      return;
    }

    const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);

    if (req.method === 'OPTIONS') {
      handleOptions(res);
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'GET' && parsedUrl.pathname === '/v1/tracking/vscode/summary') {
      handleSummary(res, parsedUrl);
      return;
    }

    if (req.method === 'POST' && parsedUrl.pathname === '/v1/tracking/vscode/heartbeat') {
      await handleHeartbeat(req, res, parsedUrl);
      return;
    }

    sendError(res, 404, 'Not found');
  });

  server.listen(PORT, () => {
    console.log(`[saul-daemon] listening on http://127.0.0.1:${PORT}`);
    if (!PAIRING_KEY) {
      console.warn('[saul-daemon] Warning: no PAIRING_KEY set. Set PAIRING_KEY env var to lock access.');
    }
  });
}

start().catch((error) => {
  console.error('Failed to start SaulDaemon', error);
  process.exit(1);
});
