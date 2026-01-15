const { fetchWithTimeout } = require('../net-helpers');

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

async function getHealth(apiBase) {
  const url = buildUrl(apiBase, '/health');
  const res = await fetchWithTimeout(url, 4000);
  return res;
}

async function postHeartbeats(apiBase, key, heartbeats) {
  const url = buildUrl(apiBase, '/v1/vscode/heartbeats', { key });
  const res = await fetchWithTimeout(url, 5000, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, heartbeats })
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json?.() ?? {};
}

async function getSummaries(apiBase, key, params) {
  const url = buildUrl(apiBase, '/v1/vscode/summaries', { key, ...params });
  const res = await fetchWithTimeout(url, 5000);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function getStats(apiBase, key, path, params) {
  const url = buildUrl(apiBase, path, { key, ...params });
  const res = await fetchWithTimeout(url, 5000);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function getBreakdown(apiBase, key, path, params) {
  const url = buildUrl(apiBase, path, { key, ...params });
  const res = await fetchWithTimeout(url, 5000);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

async function getIndex(apiBase, key, date) {
  const url = buildUrl(apiBase, '/v1/tracking/index', { key, date });
  const res = await fetchWithTimeout(url, 5000);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json();
}

module.exports = {
  buildUrl,
  getHealth,
  postHeartbeats,
  getSummaries,
  getStats,
  getBreakdown,
  getIndex
};
