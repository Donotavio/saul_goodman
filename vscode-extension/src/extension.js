const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

// Lazy load these to avoid blocking activation
let child_process, fetchWithTimeout, parsePort, apiClient;
let BufferedEventQueue, HeartbeatTracker, registerExtraEventCollectors, createHeartbeatFactory;
let GitTracker, EditorMetadataTracker, WorkspaceTracker;
let DebugTracker, TestTracker, TaskTracker, ExtensionTracker, TerminalTracker;
let FocusTracker, DiagnosticTracker, RefactorTracker, showReports;
let ComboTracker, ComboToast;

let statusBarItem = null;
let statusPollTimer = null;
let trackingController = null;
let localesRootDir = null;
let currentComboSuffix = '';

const SUPPORTED_LOCALES = ['en_US', 'pt_BR', 'es_419'];
const DEFAULT_LOCALE = 'en_US';
const LANGUAGE_ALIASES = {
  'en': 'en_US',
  'en-us': 'en_US',
  'pt': 'pt_BR',
  'pt-br': 'pt_BR',
  'es': 'es_419',
  'es-419': 'es_419'
};
const CONFIG_LOCALE_MAP = {
  'en-US': 'en_US',
  'pt-BR': 'pt_BR',
  'es-419': 'es_419'
};
const messagesCache = new Map();

function getPreferredLocale() {
  try {
    const config = vscode.workspace.getConfiguration('saulGoodman');
    const configured = config.get('language', 'auto');
    if (configured && configured !== 'auto') {
      const mapped = CONFIG_LOCALE_MAP[configured];
      if (mapped && SUPPORTED_LOCALES.includes(mapped)) {
        return mapped;
      }
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
  return DEFAULT_LOCALE;
}

function localize(key, params) {
  const locale = getPreferredLocale();
  const bundle = loadMessages(locale) ?? {};
  const fallback = loadMessages(DEFAULT_LOCALE) ?? {};
  const template = bundle[key] ?? fallback[key] ?? key;
  return formatMessage(template, params);
}

function loadMessages(locale) {
  if (messagesCache.has(locale)) {
    return messagesCache.get(locale);
  }
  const rootDir = localesRootDir || path.join(__dirname, '..', '..', '_locales');
  const filePath = path.join(rootDir, locale, 'messages.json');
  try {
    if (!fs.existsSync(filePath)) {
      console.warn(`[Saul i18n] Messages file not found: ${filePath}`);
      messagesCache.set(locale, null);
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    const mapped = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (value && typeof value === 'object' && typeof value.message === 'string') {
        mapped[key] = value.message;
      }
    }
    messagesCache.set(locale, mapped);
    console.log(`[Saul i18n] Loaded ${Object.keys(mapped).length} keys for locale ${locale}`);
    return mapped;
  } catch (error) {
    console.error(`[Saul i18n] Failed to load ${filePath}:`, error.message);
    messagesCache.set(locale, null);
    return null;
  }
}

async function warmLocaleCache() {
  return new Promise((resolve) => {
    setTimeout(() => {
      try {
        const locale = getPreferredLocale();
        loadMessages(locale);
        if (locale !== DEFAULT_LOCALE) {
          loadMessages(DEFAULT_LOCALE);
        }
      } catch (error) {
        console.error('[Saul i18n] Failed to warm locale cache:', error);
      }
      resolve();
    }, 500);
  });
}

function formatMessage(message, params = {}) {
  return message.replace(/\{(\w+)\}/g, (match, token) => {
    const value = params[token];
    return value === undefined || value === null ? '' : String(value);
  });
}

function getTodayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function formatDurationSeconds(seconds) {
  if (!Number.isFinite(seconds)) {
    return '--';
  }
  const total = Math.round(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

function activate(context) {
  console.log('[Saul] Activation starting...');
  
  try {
    localesRootDir = path.join(context.extensionPath, '_locales');
    
    // Lazy load modules asynchronously to avoid blocking activation
    setTimeout(() => {
      try {
        child_process = require('child_process');
        const netHelpers = require('./net-helpers');
        fetchWithTimeout = netHelpers.fetchWithTimeout;
        parsePort = netHelpers.parsePort;
        apiClient = require('./apiClient');
        BufferedEventQueue = require('./queue/buffered-event-queue').BufferedEventQueue;
        HeartbeatTracker = require('./tracking/heartbeat-tracker').HeartbeatTracker;
        createHeartbeatFactory = require('./tracking/heartbeat-factory').createHeartbeatFactory;
        registerExtraEventCollectors = require('./tracking/extra-events').registerExtraEventCollectors;
        
        GitTracker = require('./tracking/git-tracker').GitTracker;
        EditorMetadataTracker = require('./tracking/editor-metadata-tracker').EditorMetadataTracker;
        WorkspaceTracker = require('./tracking/workspace-tracker').WorkspaceTracker;
        DebugTracker = require('./tracking/debug-tracker').DebugTracker;
        TestTracker = require('./tracking/test-tracker').TestTracker;
        TaskTracker = require('./tracking/task-tracker').TaskTracker;
        ExtensionTracker = require('./tracking/extension-tracker').ExtensionTracker;
        TerminalTracker = require('./tracking/terminal-tracker').TerminalTracker;
        FocusTracker = require('./tracking/focus-tracker').FocusTracker;
        DiagnosticTracker = require('./tracking/diagnostic-tracker').DiagnosticTracker;
        RefactorTracker = require('./tracking/refactor-tracker').RefactorTracker;
        showReports = require('./reports/report-view').showReports;
        ComboTracker = require('./tracking/combo-tracker').ComboTracker;
        ComboToast = require('./ui/combo-toast').ComboToast;
        
        trackingController = new TrackingController(context);
        trackingController.init().catch(err => {
          console.error('[Saul] Failed to initialize tracking:', err);
        });
      } catch (error) {
        console.error('[Saul] Failed to load modules:', error);
      }
    }, 100);
    
    // Warm locale cache
    void warmLocaleCache();

    // Register commands immediately
    context.subscriptions.push(
      vscode.commands.registerCommand('saulGoodman.startDaemon', () => {
        trackingController?.trackOwnCommand('saulGoodman.startDaemon');
        if (!child_process) {
          vscode.window.showWarningMessage(localize('vscode_loading_message'));
          return;
        }
        void prepareDaemonCommand();
      }),
      vscode.commands.registerCommand('saulGoodman.testDaemon', () => {
        trackingController?.trackOwnCommand('saulGoodman.testDaemon');
        if (!apiClient) {
          vscode.window.showWarningMessage(localize('vscode_loading_message'));
          return;
        }
        void testDaemonHealth();
      }),
      vscode.commands.registerCommand('saulGoodman.openReports', () => {
        trackingController?.trackOwnCommand('saulGoodman.openReports');
        if (!showReports) {
          vscode.window.showWarningMessage(localize('vscode_loading_message'));
          return;
        }
        showReports(context, readConfig, getReportI18n);
      }),
      vscode.commands.registerCommand('saulGoodman.setupPomodoro', async () => {
        trackingController?.trackOwnCommand('saulGoodman.setupPomodoro');
        if (!trackingController) {
          vscode.window.showWarningMessage(localize('vscode_loading_message'));
          return;
        }
        await trackingController.setupPomodoroHelper();
      }),
      vscode.commands.registerCommand('saulGoodman.resetCombo', async () => {
        const answer = await vscode.window.showWarningMessage(
          localize('vscode_combo_reset_confirm'),
          { modal: true },
          localize('vscode_combo_reset_yes'),
          localize('vscode_combo_reset_cancel')
        );

        if (answer === localize('vscode_combo_reset_yes')) {
          if (trackingController && trackingController.comboTracker) {
            await trackingController.comboTracker.resetCombo();
            await context.globalState.update('sg:combo:state', undefined);
            vscode.window.showInformationMessage(localize('vscode_combo_reset_success'));
            console.log('[Saul Combo] Manual reset completed');
          }
        }
      })
    );

    context.subscriptions.push(
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('saulGoodman')) {
          trackingController?.reloadConfig();
          void updateStatusBar('unknown');
        }
      })
    );

    initStatusBar(context);
    console.log('[Saul] Extension activated (modules loading in background)');
  } catch (error) {
    console.error('[Saul] Activation failed:', error);
  }
}

function deactivate() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
    statusPollTimer = null;
  }
  trackingController?.dispose();
  trackingController = null;
}

class TrackingController {
  constructor(context) {
    this.context = context;
    this.config = readConfig();
    this.queue = new BufferedEventQueue({
      apiClient,
      storageDir: context.globalStorageUri.fsPath,
      apiBase: this.config.apiBase,
      pairingKey: this.config.pairingKey,
      enabled: this.config.enableTracking
    });
    this.buildHeartbeat = createHeartbeatFactory(context, () => this.config);
    
    // Inicializar ComboToast
    this.comboToast = new ComboToast({
      context,
      localize
    });
    
    // Inicializar ComboTracker
    this.comboTracker = new ComboTracker({
      context,
      getConfig: () => this.config,
      queue: this.queue,
      buildHeartbeat: this.buildHeartbeat,
      onComboChange: (comboData) => {
        this.comboToast.show(comboData);
        void this.updateStatusBarWithCombo(comboData);
      }
    });
    
    this.heartbeatTracker = new HeartbeatTracker({
      context,
      queue: this.queue,
      getConfig: () => this.config,
      buildHeartbeat: this.buildHeartbeat
    });
    this.gitTracker = new GitTracker({
      context,
      queue: this.queue,
      getConfig: () => this.config,
      buildHeartbeat: this.buildHeartbeat
    });
    this.editorMetadataTracker = new EditorMetadataTracker({
      context,
      queue: this.queue,
      getConfig: () => this.config,
      buildHeartbeat: this.buildHeartbeat
    });
    this.workspaceTracker = new WorkspaceTracker({
      context,
      queue: this.queue,
      getConfig: () => this.config,
      buildHeartbeat: this.buildHeartbeat
    });
    this.debugTracker = new DebugTracker({
      context,
      queue: this.queue,
      getConfig: () => this.config,
      buildHeartbeat: this.buildHeartbeat
    });
    this.testTracker = new TestTracker({
      context,
      queue: this.queue,
      getConfig: () => this.config,
      buildHeartbeat: this.buildHeartbeat
    });
    this.taskTracker = new TaskTracker({
      context,
      queue: this.queue,
      getConfig: () => this.config,
      buildHeartbeat: this.buildHeartbeat
    });
    this.extensionTracker = new ExtensionTracker({
      context,
      queue: this.queue,
      getConfig: () => this.config,
      buildHeartbeat: this.buildHeartbeat
    });
    this.terminalTracker = new TerminalTracker({
      context,
      queue: this.queue,
      getConfig: () => this.config,
      buildHeartbeat: this.buildHeartbeat
    });
    this.focusTracker = new FocusTracker({
      context,
      queue: this.queue,
      getConfig: () => this.config,
      buildHeartbeat: this.buildHeartbeat,
      comboTracker: this.comboTracker,
      heartbeatTracker: this.heartbeatTracker
    });
    this.diagnosticTracker = new DiagnosticTracker({
      context,
      queue: this.queue,
      getConfig: () => this.config,
      buildHeartbeat: this.buildHeartbeat
    });
    this.refactorTracker = new RefactorTracker({
      context,
      queue: this.queue,
      getConfig: () => this.config,
      buildHeartbeat: this.buildHeartbeat
    });
    registerExtraEventCollectors({
      context,
      queue: this.queue,
      getConfig: () => this.config,
      buildHeartbeat: this.buildHeartbeat
    });
    this.promptedMissingKey = false;
  }

  async init() {
    try {
      await this.queue.init();
      this.queue.start();
      await this.checkDailyReset();
      
      // Start combo tracker
      await this.comboTracker.start();
      
      // Notify user if telemetry is disabled (pomodoro won't work)
      this.checkPomodoroSetup();
      
      // Start core trackers with staggered delays to prevent blocking
      setTimeout(() => this.safeStart(() => this.gitTracker.start()), 100);
      setTimeout(() => this.safeStart(() => this.editorMetadataTracker.start()), 200);
      setTimeout(() => this.safeStart(() => this.workspaceTracker.start()), 300);
      
      // Start telemetry trackers with additional delays
      if (this.config.enableTelemetry) {
        setTimeout(() => this.safeStart(() => this.debugTracker.start()), 500);
        setTimeout(() => this.safeStart(() => this.testTracker.start()), 600);
        setTimeout(() => this.safeStart(() => this.taskTracker.start()), 700);
        setTimeout(() => this.safeStart(() => this.extensionTracker.start()), 800);
        setTimeout(() => this.safeStart(() => this.terminalTracker.start()), 900);
        setTimeout(() => this.safeStart(() => this.focusTracker.start()), 1000);
        setTimeout(() => this.safeStart(() => this.diagnosticTracker.start()), 1100);
        setTimeout(() => this.safeStart(() => this.refactorTracker.start()), 1200);
      }
      
      this.applyConfig();
    } catch (error) {
      console.error('[Saul] Failed to initialize tracking controller:', error);
    }
  }

  async updateStatusBarWithCombo(comboData) {
    if (!comboData) {
      currentComboSuffix = '';
      void pollStatus();
      return;
    }
    
    const { level, pomodoros, maxComboToday, totalMinutes } = comboData;
    
    if (level === 0) {
      currentComboSuffix = '';
    } else {
      // Emoji dinâmico por nível
      const emoji = level >= 5 ? '💎' : level >= 4 ? '💥' : level >= 3 ? '⚡' : level >= 2 ? '🔥' : '🎯';
      
      // Informações ricas: emoji + streak + tempo + max hoje
      const minutes = totalMinutes || pomodoros * 25;
      const maxIndicator = maxComboToday > pomodoros ? ` | ⭐ ${maxComboToday}x` : '';
      currentComboSuffix = ` | ${emoji} ${pomodoros}x COMBO (${minutes}min)${maxIndicator}`;
    }
    
    void pollStatus();
  }
  
  async getComboStats() {
    return this.comboTracker ? await this.comboTracker.getStats() : null;
  }

  checkPomodoroSetup() {
    if (!this.config.enableTelemetry) {
      setTimeout(() => {
        vscode.window.showWarningMessage(
          localize('vscode_pomodoro_disabled_warning'),
          localize('vscode_pomodoro_enable_now'),
          localize('vscode_pomodoro_enable_later')
        ).then(choice => {
          if (choice === localize('vscode_pomodoro_enable_now')) {
            vscode.commands.executeCommand('saulGoodman.setupPomodoro');
          }
        });
      }, 3000);
    }
  }

  async setupPomodoroHelper() {
    const config = vscode.workspace.getConfiguration('saulGoodman');
    const telemetryEnabled = config.get('enableTelemetry', false);
    const testModeEnabled = config.get('pomodoroTestMode', false);
    
    let message = localize('vscode_pomodoro_setup_title');
    
    if (!telemetryEnabled) {
      message += localize('vscode_pomodoro_telemetry_disabled');
    } else {
      message += localize('vscode_pomodoro_telemetry_enabled');
    }
    
    if (testModeEnabled) {
      message += localize('vscode_pomodoro_testmode_enabled');
    } else {
      message += localize('vscode_pomodoro_testmode_disabled');
    }
    
    message += localize('vscode_pomodoro_what_to_do');
    
    const choices = [];
    if (!telemetryEnabled) {
      choices.push(localize('vscode_pomodoro_enable_telemetry'));
    }
    if (!testModeEnabled) {
      choices.push(localize('vscode_pomodoro_enable_testmode'));
    }
    if (!telemetryEnabled || !testModeEnabled) {
      choices.push(localize('vscode_pomodoro_enable_all'));
    }
    choices.push(localize('vscode_pomodoro_open_settings'), localize('vscode_combo_reset_cancel'));
    
    const choice = await vscode.window.showInformationMessage(message, { modal: true }, ...choices);
    
    if (choice === localize('vscode_pomodoro_enable_telemetry')) {
      await config.update('enableTelemetry', true, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(localize('vscode_pomodoro_telemetry_activated'));
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    } else if (choice === localize('vscode_pomodoro_enable_testmode')) {
      await config.update('pomodoroTestMode', true, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(localize('vscode_pomodoro_testmode_activated'));
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    } else if (choice === localize('vscode_pomodoro_enable_all')) {
      await config.update('enableTelemetry', true, vscode.ConfigurationTarget.Global);
      await config.update('pomodoroTestMode', true, vscode.ConfigurationTarget.Global);
      vscode.window.showInformationMessage(localize('vscode_pomodoro_all_activated'));
      await vscode.commands.executeCommand('workbench.action.reloadWindow');
    } else if (choice === localize('vscode_pomodoro_open_settings')) {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'saulGoodman');
    }
  }

  safeStart(startFn) {
    try {
      const result = startFn();
      if (result && typeof result.catch === 'function') {
        result.catch(error => {
          console.error('[Saul] Tracker start error:', error);
        });
      }
    } catch (error) {
      console.error('[Saul] Tracker start error:', error);
    }
  }

  trackOwnCommand(command) {
    if (this.extensionTracker && this.config.enableTelemetry) {
      this.extensionTracker.trackCommand(command, 'donotavio.saul-goodman-vscode');
    }
  }

  dispose() {
    this.queue.stop();
    this.heartbeatTracker.dispose();
    this.gitTracker.dispose();
    this.editorMetadataTracker.dispose();
    this.workspaceTracker.dispose();
    this.debugTracker.dispose();
    this.testTracker.dispose();
    this.taskTracker.dispose();
    this.extensionTracker.dispose();
    this.terminalTracker.dispose();
    this.focusTracker.dispose();
    this.diagnosticTracker.dispose();
    this.refactorTracker.dispose();
    this.comboTracker.dispose();
    this.comboToast.dispose();
  }

  reloadConfig() {
    this.config = readConfig();
    this.queue.updateConfig({
      apiBase: this.config.apiBase,
      pairingKey: this.config.pairingKey,
      enabled: this.config.enableTracking
    });
    this.applyConfig();
  }

  async checkDailyReset() {
    const storageKey = 'sg:vscode:lastActiveDate';
    const today = getTodayKey();
    try {
      const stored = this.context.globalState.get(storageKey);
      if (stored && stored !== today) {
        console.log(`[Saul] Day changed from ${stored} to ${today}, clearing old data`);
        await this.queue.clearOldEvents();
        this.heartbeatTracker.lastSentByEntity.clear();
      }
      await this.context.globalState.update(storageKey, today);
    } catch (error) {
      console.error('[Saul] Failed to check daily reset:', error);
    }
  }

  applyConfig() {
    if (this.config.enableTracking) {
      this.heartbeatTracker.start();
      void this.gitTracker.start();
      this.editorMetadataTracker.start();
      this.workspaceTracker.start();
      if (!this.config.pairingKey) {
        void this.promptMissingKey();
      }
    } else {
      this.heartbeatTracker.dispose();
      this.gitTracker.dispose();
      this.editorMetadataTracker.dispose();
      this.workspaceTracker.dispose();
    }

    if (this.config.enableTelemetry) {
      this.debugTracker.start();
      this.testTracker.start();
      this.taskTracker.start();
      this.extensionTracker.start();
      this.terminalTracker.start();
      this.focusTracker.start();
      this.diagnosticTracker.start();
      this.refactorTracker.start();
    } else {
      this.debugTracker.dispose();
      this.testTracker.dispose();
      this.taskTracker.dispose();
      this.extensionTracker.dispose();
      this.terminalTracker.dispose();
      this.focusTracker.dispose();
      this.diagnosticTracker.dispose();
      this.refactorTracker.dispose();
    }
  }

  async promptMissingKey() {
    if (this.promptedMissingKey) {
      return;
    }
    this.promptedMissingKey = true;
    try {
      const value = await vscode.window.showInputBox({
        title: localize('prompt_missing_key_title'),
        prompt: localize('prompt_missing_key_prompt'),
        placeHolder: 'ex: teste-123',
        ignoreFocusOut: true
      });
      this.promptedMissingKey = false;
      const key = value?.trim();
      if (!key) {
        await vscode.window
          .showWarningMessage(
            localize('prompt_missing_key_warning'),
            localize('prompt_missing_key_open_settings')
          )
          .then((choice) => {
            if (choice === localize('prompt_missing_key_open_settings')) {
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
      this.queue.updateConfig({ pairingKey: key });
    } catch {
      this.promptedMissingKey = false;
    }
  }
}

function getReportI18n() {
  return {
    disabled: localize('vscode_reports_disabled'),
    disabledDetail: localize('vscode_reports_disabled_detail'),
    loading: localize('vscode_reports_loading'),
    error: localize('vscode_reports_error'),
    synced: localize('vscode_reports_synced'),
    configure: localize('vscode_reports_configure'),
    filterProject: localize('vscode_reports_filter_project'),
    filterLanguage: localize('vscode_reports_filter_language'),
    filterMachine: localize('vscode_reports_filter_machine'),
    filterAll: localize('vscode_reports_filter_all'),
    filterApply: localize('vscode_reports_filter_apply'),
    filterClear: localize('vscode_reports_filter_clear'),
    today: localize('vscode_reports_today'),
    projects: localize('vscode_reports_projects'),
    languages: localize('vscode_reports_languages'),
    summaries: localize('vscode_reports_summaries'),
    noData: localize('vscode_reports_no_data'),
    noRecords: localize('vscode_reports_no_records'),
    
    report_vscode_title: localize('report_vscode_title'),
    report_vscode_status_loading: localize('report_vscode_status_loading'),
    report_vscode_logo_caption: localize('report_vscode_logo_caption'),
    report_vscode_filters_title: localize('report_vscode_filters_title'),
    report_vscode_index_label: localize('report_vscode_index_label'),
    report_vscode_kpi_focus: localize('report_vscode_kpi_focus'),
    report_vscode_kpi_switches: localize('report_vscode_kpi_switches'),
    report_vscode_kpi_productive: localize('report_vscode_kpi_productive'),
    report_vscode_kpi_procrast: localize('report_vscode_kpi_procrast'),
    report_vscode_kpi_inactive: localize('report_vscode_kpi_inactive'),
    report_vscode_branches: localize('report_vscode_branches'),
    report_vscode_activity: localize('report_vscode_activity'),
    report_vscode_hourly_breakdown: localize('report_vscode_hourly_breakdown'),
    report_vscode_hourly_subtitle: localize('report_vscode_hourly_subtitle'),
    report_vscode_hourly_empty: localize('report_vscode_hourly_empty'),
    report_vscode_time_by_project: localize('report_vscode_time_by_project'),
    report_vscode_time_by_project_subtitle: localize('report_vscode_time_by_project_subtitle'),
    report_vscode_projects_empty: localize('report_vscode_projects_empty'),
    report_vscode_commit_activity: localize('report_vscode_commit_activity'),
    report_vscode_commit_subtitle: localize('report_vscode_commit_subtitle'),
    report_vscode_commits_empty: localize('report_vscode_commits_empty'),
    report_vscode_languages_projects: localize('report_vscode_languages_projects'),
    report_vscode_languages_projects_subtitle: localize('report_vscode_languages_projects_subtitle'),
    report_vscode_cross_reference_empty: localize('report_vscode_cross_reference_empty'),
    report_vscode_workspaces: localize('report_vscode_workspaces'),
    report_vscode_editor_info: localize('report_vscode_editor_info'),
    report_vscode_telemetry_title: localize('report_vscode_telemetry_title'),
    report_vscode_telemetry_subtitle: localize('report_vscode_telemetry_subtitle'),
    report_vscode_tel_debug_sessions: localize('report_vscode_tel_debug_sessions'),
    report_vscode_tel_test_rate: localize('report_vscode_tel_test_rate'),
    report_vscode_tel_builds: localize('report_vscode_tel_builds'),
    report_vscode_tel_pomodoros: localize('report_vscode_tel_pomodoros'),
    report_vscode_tel_combo: localize('report_vscode_tel_combo'),
    report_vscode_combo_timeline: localize('report_vscode_combo_timeline'),
    report_vscode_combo_timeline_subtitle: localize('report_vscode_combo_timeline_subtitle'),
    report_vscode_combo_timeline_empty: localize('report_vscode_combo_timeline_empty'),
    report_vscode_terminal_commands: localize('report_vscode_terminal_commands'),
    report_vscode_terminal_subtitle: localize('report_vscode_terminal_subtitle'),
    report_vscode_terminal_empty: localize('report_vscode_terminal_empty'),
    report_vscode_focus_patterns: localize('report_vscode_focus_patterns'),
    report_vscode_focus_patterns_subtitle: localize('report_vscode_focus_patterns_subtitle'),
    report_vscode_focus_patterns_empty: localize('report_vscode_focus_patterns_empty'),
    report_vscode_top_extensions: localize('report_vscode_top_extensions'),
    report_vscode_top_debugged_files: localize('report_vscode_top_debugged_files'),
    report_vscode_top_error_files: localize('report_vscode_top_error_files'),
    report_vscode_refactoring_activity: localize('report_vscode_refactoring_activity'),
    report_vscode_refresh_button: localize('report_vscode_refresh_button'),
    
    vscode_reports_disabled: localize('vscode_reports_disabled'),
    vscode_reports_disabled_detail: localize('vscode_reports_disabled_detail'),
    vscode_reports_filter_project: localize('vscode_reports_filter_project'),
    vscode_reports_filter_language: localize('vscode_reports_filter_language'),
    vscode_reports_filter_machine: localize('vscode_reports_filter_machine'),
    vscode_reports_filter_all: localize('vscode_reports_filter_all'),
    vscode_reports_filter_apply: localize('vscode_reports_filter_apply'),
    vscode_reports_filter_clear: localize('vscode_reports_filter_clear'),
    vscode_reports_today: localize('vscode_reports_today'),
    vscode_reports_projects: localize('vscode_reports_projects'),
    vscode_reports_languages: localize('vscode_reports_languages'),
    vscode_reports_summaries: localize('vscode_reports_summaries')
  };
}

function readConfig() {
  const config = vscode.workspace.getConfiguration('saulGoodman');
  const enableTracking = config.get('enableTracking', config.get('enabled', true));
  return {
    enableTracking,
    apiBase: config.get('apiBase', 'http://127.0.0.1:3123'),
    pairingKey: config.get('pairingKey', ''),
    hashFilePaths: config.get('hashFilePaths', true),
    hashProjectNames: config.get('hashProjectNames', false),
    heartbeatIntervalMs: config.get('heartbeatIntervalMs', 15000),
    idleThresholdMs: config.get('idleThresholdMs', 60000),
    enableReportsInVscode: config.get('enableReportsInVscode', true),
    enableSensitiveTelemetry: config.get('enableSensitiveTelemetry', false),
    enableTelemetry: config.get('enableTelemetry', false),
    pomodoroTestMode: config.get('pomodoroTestMode', false),
    inactivityTimeoutMs: config.get('inactivityTimeoutMs', 300000),
    telemetrySampleDiagnosticsIntervalSec: config.get('telemetrySampleDiagnosticsIntervalSec', 60),
    telemetryRetentionDays: config.get('telemetryRetentionDays', 30)
  };
}

async function prepareDaemonCommand() {
  const config = readConfig();
  const keyInput = await vscode.window.showInputBox({
    title: localize('prepare_key_title'),
    prompt: localize('prepare_key_prompt'),
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
    title: localize('prepare_port_title'),
    prompt: localize('prepare_port_prompt'),
    value: inferPortFromApiBase(config.apiBase) || '3123',
    ignoreFocusOut: true
  });
  if (portInput === undefined) {
    return;
  }
  const parsedPort = parsePort(portInput.trim() || '3123');
  if (!parsedPort) {
    vscode.window.showErrorMessage(localize('prepare_start_failed', { error: localize('prepare_port_invalid') }));
    return;
  }
  const port = String(parsedPort);

  const workspace = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  const daemonDir = workspace ? path.join(workspace, 'saul-daemon') : null;
  const daemonIndex = daemonDir ? path.join(daemonDir, 'index.cjs') : null;
  const daemonExists = Boolean(daemonIndex && fs.existsSync(daemonIndex));

  if (!daemonExists) {
    vscode.window.showErrorMessage(localize('prepare_missing_daemon'));
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
      localize('prepare_started', { port, key, logFile })
    );
    void updateStatusBar('ok', port);
    trackingController?.reloadConfig?.();
  } catch (error) {
    vscode.window.showErrorMessage(localize('prepare_start_failed', { error: error.message }));
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

async function testDaemonHealth() {
  const config = readConfig();
  const apiBase = config.apiBase?.trim() || 'http://127.0.0.1:3123';
  const url = new URL('/v1/health', apiBase);
  try {
    const res = await fetchWithTimeout(url.toString(), 4000);
    if (res.ok) {
      vscode.window.showInformationMessage(localize('test_health_success', { origin: url.origin }));
      void updateStatusBar('ok', url.port || '3123');
      return;
    }
    vscode.window.showWarningMessage(
      localize('test_health_status', { status: res.status, origin: url.origin })
    );
    void updateStatusBar('error');
  } catch (error) {
    vscode.window.showWarningMessage(
      localize('test_health_failure', { origin: url.origin, error: error.message })
    );
    void updateStatusBar('error');
  }
}

function initStatusBar(context) {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'saulGoodman.testDaemon';
  statusBarItem.text = `$(loading~spin) ${localize('status_loading_text')}`;
  statusBarItem.tooltip = localize('status_loading_tooltip');
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  void updateStatusBar('unknown');
  startStatusPolling();
}

async function updateStatusBar(state, port, stats, comboSuffix) {
  if (!statusBarItem) {
    return;
  }
  const portSuffix = port ? localize('status_port_suffix', { port }) : '';
  const combo = comboSuffix || '';
  
  if (state === 'ok') {
    if (stats && typeof stats.totalSeconds === 'number') {
      const timeLabel = formatDurationSeconds(stats.totalSeconds);
      const indexLabel = typeof stats.index === 'number' ? ` | ${stats.index}%` : '';
      statusBarItem.text = `$(law) ${localize('status_today_text', { time: timeLabel })}${indexLabel}${combo}`;
      statusBarItem.tooltip = localize('status_today_tooltip', {
        time: timeLabel,
        port: portSuffix
      });
    } else {
      statusBarItem.text = `$(debug-start) ${localize('status_on_text', { port: portSuffix })}${combo}`;
      statusBarItem.tooltip = localize('status_on_tooltip');
    }
    statusBarItem.color = undefined;
  } else if (state === 'error') {
    statusBarItem.text = `$(error) ${localize('status_off_text')}`;
    statusBarItem.color = new vscode.ThemeColor('errorForeground');
    statusBarItem.tooltip = localize('status_off_tooltip');
  } else if (state === 'disabled') {
    statusBarItem.text = `$(circle-slash) ${localize('status_disabled_text')}`;
    statusBarItem.color = undefined;
    statusBarItem.tooltip = localize('status_disabled_tooltip');
  } else {
    statusBarItem.text = `$(loading~spin) ${localize('status_loading_text')}`;
    statusBarItem.color = undefined;
    statusBarItem.tooltip = localize('status_loading_tooltip');
  }
}

async function pollStatus() {
  const config = readConfig();
  if (!config.enableTracking) {
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
    endpoint = new URL('/v1/health', baseUrl);
  } catch {
    await updateStatusBar('error');
    return;
  }

  try {
    const healthRes = await apiClient.getHealth(baseUrl);
    if (!healthRes.ok) {
      throw new Error(`HTTP ${healthRes.status}`);
    }
    const today = new Date().toISOString().slice(0, 10);
    const [summary, indexData] = await Promise.all([
      apiClient.getSummaries(baseUrl, key, { start: today, end: today }),
      apiClient.getIndex(baseUrl, key, today).catch(() => null)
    ]);
    const totalSeconds = summary?.data?.days?.[0]?.total_seconds ?? 0;
    const index = indexData?.index ?? null;
    
    // Obter combo atual do tracker
    if (!currentComboSuffix && trackingController) {
      const comboStats = await trackingController.getComboStats();
      if (comboStats && comboStats.currentLevel > 0) {
        currentComboSuffix = ` | ${localize('combo_status_bar_suffix', { level: comboStats.currentLevel })}`;
      }
    }
    
    await updateStatusBar('ok', endpoint.port || inferPortFromApiBase(baseUrl), {
      totalSeconds,
      index
    }, currentComboSuffix);
  } catch {
    await updateStatusBar('error');
  }
}

function startStatusPolling() {
  if (statusPollTimer) {
    clearInterval(statusPollTimer);
  }
  void pollStatus();
  statusPollTimer = setInterval(pollStatus, 60000);
}

module.exports = {
  activate,
  deactivate
};
