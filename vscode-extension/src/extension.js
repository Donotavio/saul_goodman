const vscode = require('vscode');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

let statusBarItem = null;
let statusPollTimer = null;

const SUPPORTED_LANGUAGES = ['en-US', 'pt-BR', 'es-419'];
const DEFAULT_LANGUAGE = 'en-US';
const LANGUAGE_ALIASES = {
  'en': 'en-US',
  'en-us': 'en-US',
  'pt': 'pt-BR',
  'pt-br': 'pt-BR',
  'es': 'es-419',
  'es-419': 'es-419'
};

const MESSAGES = {
  'en-US': {
    'status.index.text': 'Saul Index: {index}',
    'status.index.tooltip': 'Index {index} — updated at {time}{port}',
    'status.portSuffix': ' (port {port})',
    'status.on.text': 'SaulDaemon ON{port}',
    'status.on.tooltip': 'SaulDaemon connected',
    'status.off.text': 'SaulDaemon OFF',
    'status.off.tooltip': 'SaulDaemon unavailable',
    'status.disabled.text': 'SaulDaemon disabled',
    'status.disabled.tooltip': 'VS Code integration is disabled',
    'status.loading.text': 'Checking SaulDaemon...',
    'status.loading.tooltip': 'Checking SaulDaemon',
    'prepare.keyTitle': 'Saul Goodman: pairing key',
    'prepare.keyPrompt': 'Enter the same key configured in the Chrome extension.',
    'prepare.portTitle': 'Saul Goodman: daemon port',
    'prepare.portPrompt': 'Local HTTP port of the daemon.',
    'prepare.missingDaemon': 'Cannot find saul-daemon/index.cjs. Open the repository root before starting the daemon.',
    'prepare.started': 'SaulDaemon started in background (port {port}, key {key}). Logs saved at {logFile}.',
    'prepare.startFailed': 'Failed to start SaulDaemon: {error}',
    'prompt.missingKey.title': 'Saul Goodman: configure a pairing key',
    'prompt.missingKey.prompt': 'Enter the same key configured in the Chrome extension.',
    'prompt.missingKey.warning': 'Without a pairing key we cannot send active time. Open settings now?',
    'prompt.missingKey.openSettings': 'Open settings',
    'test.healthSuccess': 'SaulDaemon responded at {origin}',
    'test.healthStatus': 'SaulDaemon responded with status {status} at {origin}',
    'test.healthFailure': 'SaulDaemon did not respond at {origin}: {error}'
  },
  'pt-BR': {
    'status.index.text': 'Índice do Saul: {index}',
    'status.index.tooltip': 'Índice {index} — atualizado em {time}{port}',
    'status.portSuffix': ' (porta {port})',
    'status.on.text': 'SaulDaemon ON{port}',
    'status.on.tooltip': 'SaulDaemon conectado',
    'status.off.text': 'SaulDaemon OFF',
    'status.off.tooltip': 'SaulDaemon indisponível',
    'status.disabled.text': 'SaulDaemon desativado',
    'status.disabled.tooltip': 'Integração VS Code desativada',
    'status.loading.text': 'Verificando SaulDaemon...',
    'status.loading.tooltip': 'Verificando SaulDaemon',
    'prepare.keyTitle': 'Saul Goodman: pairing key do SaulDaemon',
    'prepare.keyPrompt': 'Use a mesma chave configurada na extensão Chrome.',
    'prepare.portTitle': 'Saul Goodman: porta do SaulDaemon',
    'prepare.portPrompt': 'Porta HTTP local do daemon.',
    'prepare.missingDaemon': 'Pasta saul-daemon/index.cjs não encontrada. Abra o repositório raiz antes de iniciar o daemon.',
    'prepare.started': 'SaulDaemon iniciado em background (porta {port}, key {key}). Logs em {logFile}.',
    'prepare.startFailed': 'Falha ao iniciar SaulDaemon: {error}',
    'prompt.missingKey.title': 'Saul Goodman: configure uma pairing key',
    'prompt.missingKey.prompt': 'Digite a mesma chave configurada na extensão Chrome.',
    'prompt.missingKey.warning': 'Sem pairing key não enviaremos tempo. Abrir configurações agora?',
    'prompt.missingKey.openSettings': 'Abrir configurações',
    'test.healthSuccess': 'SaulDaemon respondeu em {origin}',
    'test.healthStatus': 'SaulDaemon respondeu com status {status} em {origin}',
    'test.healthFailure': 'SaulDaemon não respondeu em {origin}: {error}'
  },
  'es-419': {
    'status.index.text': 'Índice de Saul: {index}',
    'status.index.tooltip': 'Índice {index} — actualizado a las {time}{port}',
    'status.portSuffix': ' (puerto {port})',
    'status.on.text': 'SaulDaemon ON{port}',
    'status.on.tooltip': 'SaulDaemon conectado',
    'status.off.text': 'SaulDaemon OFF',
    'status.off.tooltip': 'SaulDaemon no disponible',
    'status.disabled.text': 'SaulDaemon deshabilitado',
    'status.disabled.tooltip': 'Integración VS Code desactivada',
    'status.loading.text': 'Verificando SaulDaemon...',
    'status.loading.tooltip': 'Verificando SaulDaemon',
    'prepare.keyTitle': 'Saul Goodman: clave de emparejamiento',
    'prepare.keyPrompt': 'Usa la misma clave configurada en la extensión de Chrome.',
    'prepare.portTitle': 'Saul Goodman: puerto del SaulDaemon',
    'prepare.portPrompt': 'Puerto HTTP local del daemon.',
    'prepare.missingDaemon': 'No se encontró saul-daemon/index.cjs. Abre la raíz del repositorio antes de iniciar el daemon.',
    'prepare.started': 'SaulDaemon iniciado en segundo plano (puerto {port}, clave {key}). Logs en {logFile}.',
    'prepare.startFailed': 'Error al iniciar SaulDaemon: {error}',
    'prompt.missingKey.title': 'Saul Goodman: configura una clave',
    'prompt.missingKey.prompt': 'Ingresa la misma clave configurada en la extensión de Chrome.',
    'prompt.missingKey.warning': 'Sin clave de emparejamiento no enviaremos tiempo. ¿Abrir configuraciones ahora?',
    'prompt.missingKey.openSettings': 'Abrir configuraciones',
    'test.healthSuccess': 'SaulDaemon respondió en {origin}',
    'test.healthStatus': 'SaulDaemon respondió con estado {status} en {origin}',
    'test.healthFailure': 'SaulDaemon no respondió en {origin}: {error}'
  }
};

function getPreferredLanguage() {
  try {
    const config = vscode.workspace.getConfiguration('saulGoodman');
    const configured = config.get('language', 'auto');
    if (configured && configured !== 'auto' && SUPPORTED_LANGUAGES.includes(configured)) {
      return configured;
    }
  } catch {
    // ignore configuration errors
  }
  const envLang = (vscode.env.language ?? '').toLowerCase();
  if (LANGUAGE_ALIASES[envLang]) {
    return LANGUAGE_ALIASES[envLang];
  }
  const short = envLang.split('-')[0];
  if (LANGUAGE_ALIASES[short]) {
    return LANGUAGE_ALIASES[short];
  }
  return DEFAULT_LANGUAGE;
}

function localize(key, params) {
  const lang = getPreferredLanguage();
  const bundle = MESSAGES[lang] ?? MESSAGES[DEFAULT_LANGUAGE];
  const fallback = MESSAGES[DEFAULT_LANGUAGE];
  const template = bundle[key] ?? fallback[key] ?? key;
  return formatMessage(template, params);
}

function formatMessage(message, params = {}) {
  return message.replace(/\{(\w+)\}/g, (match, token) => {
    const value = params[token];
    return value === undefined || value === null ? '' : String(value);
  });
}

function formatTimestamp(value) {
  const lang = getPreferredLanguage();
  const date = new Date(typeof value === 'number' ? value : Date.now());
  if (Number.isNaN(date.getTime())) {
    return '';
  }
  return date.toLocaleString(lang);
}

function activate(context) {
  const tracker = new ActivityTracker();
  context.subscriptions.push(tracker);
  context.subscriptions.push(
    vscode.commands.registerCommand('saulGoodman.startDaemon', () => void prepareDaemonCommand())
  );
  context.subscriptions.push(
    vscode.commands.registerCommand('saulGoodman.testDaemon', () => void testDaemonHealth())
  );
  initStatusBar(context);
}

function deactivate() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
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
        title: localize('prompt.missingKey.title'),
        prompt: localize('prompt.missingKey.prompt'),
        placeHolder: 'ex: teste-123',
        ignoreFocusOut: true
      });
      this.promptedMissingKey = false;
      const key = value?.trim();
      if (!key) {
        await vscode.window
          .showWarningMessage(
            localize('prompt.missingKey.warning'),
            localize('prompt.missingKey.openSettings')
          )
          .then((choice) => {
            if (choice === localize('prompt.missingKey.openSettings')) {
              void vscode.commands.executeCommand(
                'workbench.action.openSettings',
                'saulGoodman.pairingKey'
              );
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
    title: localize('prepare.keyTitle'),
    prompt: localize('prepare.keyPrompt'),
    value: config.pairingKey?.trim() || '',
    ignoreFocusOut: true
  });
  if (keyInput === undefined) {
    return;
  }
  const key = keyInput.trim() || 'sua-chave';
  await vscode.workspace
    .getConfiguration('saulGoodman')
    .update('pairingKey', key, vscode.ConfigurationTarget.Global);

  const portInput = await vscode.window.showInputBox({
    title: localize('prepare.portTitle'),
    prompt: localize('prepare.portPrompt'),
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
    vscode.window.showErrorMessage(localize('prepare.missingDaemon'));
    return;
  }

  try {
    const logFile = path.join(daemonDir ?? workspace, 'daemon.log');
    let stdoutFd = null;
    let stderrFd = null;
    try {
      stdoutFd = fs.openSync(logFile, 'a');
      stderrFd = fs.openSync(logFile, 'a');
    } catch {
      stdoutFd = null;
      stderrFd = null;
    }

    const child = child_process.spawn('node', ['index.cjs'], {
      cwd: daemonDir ?? workspace,
      env: { ...process.env, PAIRING_KEY: key, PORT: port },
      detached: true,
      stdio: ['ignore', stdoutFd ?? 'ignore', stderrFd ?? 'ignore']
    });
    child.unref();
    if (stdoutFd) {
      fs.closeSync(stdoutFd);
    }
    if (stderrFd) {
      fs.closeSync(stderrFd);
    }
    vscode.window.showInformationMessage(
      localize('prepare.started', { port, key, logFile })
    );
    void updateStatusBar('ok', port);
    tracker.reloadConfig?.();
  } catch (error) {
    vscode.window.showErrorMessage(localize('prepare.startFailed', { error: error.message }));
    void updateStatusBar('error');
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
  try {
    const bytes = crypto.randomBytes?.(16);
    if (bytes) {
      return `session-${Date.now()}-${bytes.toString('hex')}`;
    }
  } catch {
    // ignore and fall back below
  }
  const fallback = typeof process !== 'undefined' && process.hrtime?.bigint
    ? process.hrtime.bigint().toString(16)
    : Date.now().toString(16);
  return `session-${Date.now()}-${fallback}`;
}

async function testDaemonHealth() {
  const config = readConfig();
  const apiBase = config.apiBase?.trim() || 'http://127.0.0.1:3123';
  const url = new URL('/health', apiBase);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(url.toString(), { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) {
      vscode.window.showInformationMessage(localize('test.healthSuccess', { origin: url.origin }));
      void updateStatusBar('ok', url.port || '3123');
      return;
    }
    vscode.window.showWarningMessage(
      localize('test.healthStatus', { status: res.status, origin: url.origin })
    );
    void updateStatusBar('error');
  } catch (error) {
    vscode.window.showWarningMessage(
      localize('test.healthFailure', { origin: url.origin, error: error.message })
    );
    void updateStatusBar('error');
  }
}

function initStatusBar(context) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'saulGoodman.testDaemon';
  statusBarItem.text = `$(loading~spin) ${localize('status.loading.text')}`;
  statusBarItem.tooltip = localize('status.loading.tooltip');
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  void updateStatusBar('unknown');
  startStatusPolling();
}

async function updateStatusBar(state, port, stats) {
  if (!statusBarItem) {
    return;
  }
  const portSuffix = port ? localize('status.portSuffix', { port }) : '';
  if (state === 'ok') {
    if (stats && typeof stats.index === 'number') {
      const roundedIndex = Math.round(stats.index);
      const tooltipPort = portSuffix;
      statusBarItem.text = `$(law) ${localize('status.index.text', { index: roundedIndex })}`;
      statusBarItem.tooltip = localize('status.index.tooltip', {
        index: stats.index.toFixed(1),
        time: formatTimestamp(stats.updatedAt),
        port: tooltipPort
      });
    } else {
      statusBarItem.text = `$(debug-start) ${localize('status.on.text', { port: portSuffix })}`;
      statusBarItem.tooltip = localize('status.on.tooltip');
    }
    statusBarItem.color = undefined;
  } else if (state === 'error') {
    statusBarItem.text = `$(error) ${localize('status.off.text')}`;
    statusBarItem.color = new vscode.ThemeColor('errorForeground');
    statusBarItem.tooltip = localize('status.off.tooltip');
  } else if (state === 'disabled') {
    statusBarItem.text = `$(circle-slash) ${localize('status.disabled.text')}`;
    statusBarItem.color = undefined;
    statusBarItem.tooltip = localize('status.disabled.tooltip');
  } else {
    statusBarItem.text = `$(loading~spin) ${localize('status.loading.text')}`;
    statusBarItem.color = undefined;
    statusBarItem.tooltip = localize('status.loading.tooltip');
  }
}

function startStatusPolling() {
  const run = async () => {
    const config = readConfig();
    if (!config.enabled) {
      await updateStatusBar('disabled');
      return;
    }
    const key = config.pairingKey?.trim();
    if (!key) {
      await updateStatusBar('error');
      return;
    }
    const baseUrl = (config.apiBase?.trim() || 'http://127.0.0.1:3123').trim();
    let endpoint;
    try {
      endpoint = new URL('/v1/tracking/index', baseUrl);
    } catch {
      await updateStatusBar('error');
      return;
    }
    endpoint.searchParams.set('key', key);
    endpoint.searchParams.set('date', new Date().toISOString().slice(0, 10));

    try {
      const res = await fetchWithTimeout(endpoint.toString(), 4000);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const body = await res.json();
      await updateStatusBar('ok', endpoint.port || inferPortFromApiBase(baseUrl), body);
    } catch (error) {
      await updateStatusBar('error');
    }
  };

  if (statusPollTimer) {
    clearInterval(statusPollTimer);
  }
  void run();
  statusPollTimer = setInterval(run, 60000);
}

function fetchWithTimeout(url, timeout = 4000, options = {}) {
  if (typeof fetch === 'function') {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    const opts = { ...options, signal: controller.signal };
    return fetch(url, opts)
      .finally(() => clearTimeout(timer));
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
                try {
                  return JSON.parse(body);
                } catch (error) {
                  throw error;
                }
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
