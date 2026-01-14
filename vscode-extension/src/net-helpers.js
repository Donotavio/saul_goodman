const http = require('http');
const https = require('https');

function parsePort(value) {
  const n = Number(value);
  if (Number.isInteger(n) && n > 0 && n <= 65535) {
    return n;
  }
  return null;
}

function fetchWithTimeout(url, timeout = 4000, options = {}) {
  if (typeof fetch === 'function') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const opts = { ...options, signal: controller.signal };
    return fetch(url, opts).finally(() => clearTimeout(timer));
  }

  return new Promise((resolve, reject) => {
    try {
      const parsed = new URL(url);
      const isHttps = parsed.protocol === 'https:';
      const client = isHttps ? https : http;
      const req = client.request(
        {
          method: options.method || 'GET',
          hostname: parsed.hostname,
          port: parsed.port || (isHttps ? 443 : 80),
          path: parsed.pathname + parsed.search,
          headers: options.headers || {},
          timeout
        },
        (res) => {
          const chunks = [];
          res.on('data', (chunk) => chunks.push(chunk));
          res.on('end', () => {
            const body = Buffer.concat(chunks).toString('utf8');
            const result = {
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode ?? 0,
              json: async () => {
                if (!body) {
                  return {};
                }
                return JSON.parse(body);
              },
              text: async () => body
            };
            resolve(result);
          });
        }
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('Request timed out'));
      });
      if (options.body) {
        req.write(options.body);
      }
      req.end();
    } catch (error) {
      reject(error);
    }
  });
}

function postWithNodeHttp(url, body, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;
    const req = client.request(
      {
        method: 'POST',
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        headers: {
          'content-type': 'application/json',
          'content-length': Buffer.byteLength(body)
        },
        timeout
      },
      (res) => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve();
        } else {
          reject(new Error(`HTTP ${res.statusCode ?? 'ERR'}`));
        }
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = {
  fetchWithTimeout,
  postWithNodeHttp,
  parsePort
};
