const vscode = require('vscode');
const http = require('http');
const https = require('https');
const crypto = require('crypto');

function activate(context) {
  const tracker = new ActivityTracker();
  context.subscriptions.push(tracker);
}

function deactivate() {
  // noop
}

class ActivityTracker {
  constructor() {
    this.disposables = [];
    this.lastActivity = Date.now();
    this.lastBeat = Date.now();
    this.windowFocused = true;
    this.sessionId = null;
    this.heartbeatTimer = null;
    this.config = readConfig();

    if (!this.config.enabled) {
      return;
    }

    this.disposables.push(
      vscode.window.onDidChangeWindowState((state) => this.handleWindowStateChange(state)),
      vscode.window.onDidChangeActiveTextEditor(() => this.bumpActivity()),
      vscode.window.onDidChangeTextEditorSelection(() => this.bumpActivity()),
      vscode.workspace.onDidChangeTextDocument(() => this.bumpActivity()),
      vscode.workspace.onDidCloseTextDocument(() => this.bumpActivity()),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('saulGoodman')) {
          this.reloadConfig();
        }
      })
    );

    this.startHeartbeat();
  }

  dispose() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
    }
    this.disposables.forEach((d) => d.dispose());
  }

  reloadConfig() {
    this.config = readConfig();
  }

  handleWindowStateChange(state) {
    this.windowFocused = state.focused;
    if (state.focused) {
      this.bumpActivity(true);
    }
  }

  bumpActivity(forceNewSession = false) {
    this.lastActivity = Date.now();
    if (!this.sessionId || forceNewSession) {
      this.sessionId = createSessionId();
      this.lastBeat = Date.now();
    }
  }

  startHeartbeat() {
    const period = Math.max(5000, Number(this.config.heartbeatIntervalMs ?? 15000));
    this.heartbeatTimer = setInterval(() => this.sendHeartbeat(), period);
  }

  async sendHeartbeat() {
    if (!this.config.enabled) {
      this.sessionId = null;
      this.lastBeat = Date.now();
      return;
    }

    const now = Date.now();
    const idleLimit = Math.max(10000, Number(this.config.idleThresholdMs ?? 60000));
    const sinceActivity = now - this.lastActivity;
    const shouldReport = this.windowFocused && sinceActivity <= idleLimit;
    if (!shouldReport) {
      this.sessionId = null;
      this.lastBeat = now;
      return;
    }

    if (!this.sessionId) {
      this.sessionId = createSessionId();
      this.lastBeat = now;
      return;
    }

    const durationMs = Math.max(0, now - this.lastBeat);
    this.lastBeat = now;

    if (durationMs === 0) {
      return;
    }

    if (!this.config.pairingKey) {
      return;
    }

    try {
      await postHeartbeat(this.config.apiBase, {
        key: this.config.pairingKey,
        sessionId: this.sessionId,
        durationMs,
        timestamp: now
      });
    } catch (error) {
      console.warn('[saul-goodman-vscode] heartbeat failed', error);
    }
  }
}

function readConfig() {
  const config = vscode.workspace.getConfiguration('saulGoodman');
  return {
    enabled: config.get('enabled', true),
    apiBase: config.get('apiBase', 'http://127.0.0.1:3123'),
    pairingKey: config.get('pairingKey', ''),
    heartbeatIntervalMs: config.get('heartbeatIntervalMs', 15000),
    idleThresholdMs: config.get('idleThresholdMs', 60000)
  };
}

function createSessionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function postHeartbeat(apiBase, payload) {
  const url = new URL('/v1/tracking/vscode/heartbeat', apiBase);
  const body = JSON.stringify(payload);

  if (typeof fetch === 'function') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        signal: controller.signal
      });
      clearTimeout(timer);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      return;
    } finally {
      clearTimeout(timer);
    }
  }

  return postWithNodeHttp(url, body);
}

function postWithNodeHttp(url, body) {
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
        timeout: 5000
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
  activate,
  deactivate
};
