const { fetchWithTimeout } = require('../net-helpers');

const DEFAULT_HEALTH_TIMEOUT = 4000;
const DEFAULT_REQUEST_TIMEOUT = 5000;

function buildUrl(apiBase, path, params = {}) {
  const url = new URL(path, apiBase);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') {
      continue;
    }
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function resolveTimeout(config, fallback) {
  const custom = config?.requestTimeoutMs;
  return typeof custom === 'number' && custom > 0 ? custom : fallback;
}

async function safeJson(res, url) {
  try {
    return await (res.json?.() ?? {});
  } catch (err) {
    const status = res.status ?? 'unknown';
    throw new Error(`JSON parse failed for ${url} (HTTP ${status}): ${err.message}`);
  }
}

async function getHealth(apiBase, config) {
  const url = buildUrl(apiBase, '/health');
  const res = await fetchWithTimeout(url, resolveTimeout(config, DEFAULT_HEALTH_TIMEOUT));
  return res;
}

async function getHealthWithKey(apiBase, key, config) {
  const url = buildUrl(apiBase, '/health', { key });
  const res = await fetchWithTimeout(url, resolveTimeout(config, DEFAULT_HEALTH_TIMEOUT));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return safeJson(res, url);
}

async function postHeartbeats(apiBase, key, heartbeats, config) {
  const url = buildUrl(apiBase, '/v1/vscode/heartbeats');
  const res = await fetchWithTimeout(url, resolveTimeout(config, DEFAULT_REQUEST_TIMEOUT), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, heartbeats })
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return safeJson(res, url);
}

async function getSummaries(apiBase, key, params, config) {
  const url = buildUrl(apiBase, '/v1/vscode/summaries', { key, ...params });
  const res = await fetchWithTimeout(url, resolveTimeout(config, DEFAULT_REQUEST_TIMEOUT));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return safeJson(res, url);
}

async function getStats(apiBase, key, path, params, config) {
  const url = buildUrl(apiBase, path, { key, ...params });
  const res = await fetchWithTimeout(url, resolveTimeout(config, DEFAULT_REQUEST_TIMEOUT));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return safeJson(res, url);
}

async function getBreakdown(apiBase, key, path, params, config) {
  const url = buildUrl(apiBase, path, { key, ...params });
  const res = await fetchWithTimeout(url, resolveTimeout(config, DEFAULT_REQUEST_TIMEOUT));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return safeJson(res, url);
}

async function getIndex(apiBase, key, date, config) {
  const url = buildUrl(apiBase, '/v1/tracking/index', { key, date });
  const res = await fetchWithTimeout(url, resolveTimeout(config, DEFAULT_REQUEST_TIMEOUT));
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return safeJson(res, url);
}

async function postShutdown(apiBase, key, config) {
  const url = buildUrl(apiBase, '/v1/shutdown', { key });
  const res = await fetchWithTimeout(url, resolveTimeout(config, 3000), {
    method: 'POST'
  });
  return res.ok;
}

module.exports = {
  buildUrl,
  getHealth,
  getHealthWithKey,
  postHeartbeats,
  postShutdown,
  getSummaries,
  getStats,
  getBreakdown,
  getIndex
};
