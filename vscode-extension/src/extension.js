const vscode = require('vscode');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

function activate(context) {
  const tracker = new ActivityTracker();
  context.subscriptions.push(tracker);
  context.subscriptions.push(
    vscode.commands.registerCommand('saulGoodman.startDaemon', () => void prepareDaemonCommand())
  );
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
    this.promptedMissingKey = false;

    if (!this.config.enabled) {
      return;
    }

    if (!this.config.pairingKey) {
      void this.promptMissingKey();
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
    if (!this.config.pairingKey) {
      void this.promptMissingKey();
    } else {
      this.promptedMissingKey = false;
    }
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

  async promptMissingKey() {
    if (this.promptedMissingKey) {
      return;
    }
    this.promptedMissingKey = true;
    try {
      const value = await vscode.window.showInputBox({
        title: 'Saul Goodman: configure a pairing key',
        prompt: 'Digite a mesma chave configurada na extensão Chrome',
        placeHolder: 'ex: teste-123',
        ignoreFocusOut: true
      });
      this.promptedMissingKey = false;
      const key = value?.trim();
      if (!key) {
        await vscode.window.showWarningMessage(
          'Saul Goodman: sem pairing key não enviaremos tempo. Abra configurações para definir agora.',
          'Abrir configurações'
        ).then((choice) => {
          if (choice === 'Abrir configurações') {
            void vscode.commands.executeCommand('workbench.action.openSettings', 'saulGoodman.pairingKey');
          }
        });
        return;
      }
      const config = vscode.workspace.getConfiguration('saulGoodman');
      await config.update('pairingKey', key, vscode.ConfigurationTarget.Global);
      this.config.pairingKey = key;
    } catch {
      this.promptedMissingKey = false;
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

async function prepareDaemonCommand() {
  const config = readConfig();
  const keyInput = await vscode.window.showInputBox({
    title: 'Saul Goodman: pairing key do SaulDaemon',
    prompt: 'Use a mesma chave da extensão Chrome',
    value: config.pairingKey?.trim() || '',
    ignoreFocusOut: true
  });
  if (keyInput === undefined) {
    return;
  }
  const key = keyInput.trim() || 'sua-chave';

  const portInput = await vscode.window.showInputBox({
    title: 'Saul Goodman: porta do SaulDaemon',
    prompt: 'Porta HTTP local do daemon',
    value: inferPortFromApiBase(config.apiBase) || '3123',
    ignoreFocusOut: true
  });
  if (portInput === undefined) {
    return;
  }
  const port = portInput.trim() || '3123';

  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const daemonDir = workspace ? path.join(workspace, 'saul-daemon') : null;
  const daemonIndex = daemonDir ? path.join(daemonDir, 'index.cjs') : null;
  const daemonExists = Boolean(daemonIndex && fs.existsSync(daemonIndex));

  if (!daemonExists) {
    vscode.window.showErrorMessage(
      'Pasta saul-daemon/index.cjs não encontrada. Abra o repositório raiz antes de iniciar o daemon.'
    );
    return;
  }

  try {
    const child = child_process.spawn('node', ['index.cjs'], {
      cwd: daemonDir ?? workspace,
      env: { ...process.env, PAIRING_KEY: key, PORT: port },
      detached: true,
      stdio: 'ignore'
    });
    child.unref();
    vscode.window.showInformationMessage(
      `SaulDaemon iniciado em background (porta ${port}, key ${key}).`
    );
  } catch (error) {
    vscode.window.showErrorMessage(`Falha ao iniciar SaulDaemon: ${error.message}`);
  }
}

function inferPortFromApiBase(apiBase) {
  try {
    const url = new URL(apiBase);
    if (url.port) {
      return url.port;
    }
    return url.protocol === 'https:' ? '443' : '3123';
  } catch {
    return '3123';
  }
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
