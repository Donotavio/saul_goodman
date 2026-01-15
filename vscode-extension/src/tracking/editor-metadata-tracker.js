const vscode = require('vscode');

class EditorMetadataTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.disposables = [];
    this.lastMetadataSentAt = 0;
    this.METADATA_INTERVAL_MS = 15 * 60 * 1000;
  }

  start() {
    this.dispose();
    
    this.sendEditorMetadata();
    
    const interval = setInterval(() => {
      this.sendEditorMetadata();
    }, this.METADATA_INTERVAL_MS);

    this.disposables.push({
      dispose: () => clearInterval(interval)
    });

    this.disposables.push(
      vscode.window.onDidChangeActiveColorTheme(() => {
        this.sendEditorMetadata();
      }),
      vscode.extensions.onDidChange(() => {
        this.sendEditorMetadata();
      })
    );
  }

  dispose() {
    this.disposables.forEach((item) => item.dispose());
    this.disposables = [];
  }

  sendEditorMetadata() {
    const config = this.getConfig();
    if (!config.enableTracking) {
      return;
    }

    const now = Date.now();
    if (now - this.lastMetadataSentAt < this.METADATA_INTERVAL_MS) {
      return;
    }
    this.lastMetadataSentAt = now;

    const metadata = this.collectEditorMetadata();
    
    const heartbeat = this.buildHeartbeat({
      entityType: 'editor_metadata',
      entity: 'vscode',
      category: 'metadata',
      isWrite: false,
      metadata
    });

    this.queue.enqueue(heartbeat);
  }

  collectEditorMetadata() {
    const extensions = this.getExtensionsMetadata();
    const theme = this.getThemeMetadata();
    const settings = this.getSettingsMetadata();
    const workspace = this.getWorkspaceMetadata();

    return {
      eventType: 'editor_metadata_snapshot',
      vscodeVersion: vscode.version,
      vscodeLanguage: vscode.env.language,
      vscodeMachineId: vscode.env.machineId,
      vscodeSessionId: vscode.env.sessionId,
      vscodeRemoteName: vscode.env.remoteName || '',
      vscodeUriScheme: vscode.env.uriScheme,
      vscodeShell: vscode.env.shell || '',
      vscodeUIKind: vscode.env.uiKind === vscode.UIKind.Desktop ? 'desktop' : 'web',
      vscodeAppName: vscode.env.appName,
      vscodeAppRoot: vscode.env.appRoot,
      extensionsCount: extensions.count,
      extensionsEnabled: extensions.enabled,
      extensionsDisabled: extensions.disabled,
      topExtensions: extensions.top,
      themeKind: theme.kind,
      themeName: theme.name,
      settingsTelemetry: settings.telemetry,
      settingsAutoSave: settings.autoSave,
      settingsFormatOnSave: settings.formatOnSave,
      settingsWordWrap: settings.wordWrap,
      settingsFontSize: settings.fontSize,
      settingsFontFamily: settings.fontFamily,
      workspaceFolders: workspace.folders,
      workspaceType: workspace.type,
      workspaceName: workspace.name
    };
  }

  getExtensionsMetadata() {
    const allExtensions = vscode.extensions.all;
    const userExtensions = allExtensions.filter((ext) => !ext.packageJSON.isBuiltin);
    
    const enabled = userExtensions.filter((ext) => ext.isActive).length;
    const disabled = userExtensions.length - enabled;

    const top = userExtensions
      .filter((ext) => ext.isActive)
      .slice(0, 10)
      .map((ext) => ({
        id: ext.id,
        version: ext.packageJSON.version,
        publisher: ext.packageJSON.publisher
      }));

    return {
      count: userExtensions.length,
      enabled,
      disabled,
      top
    };
  }

  getThemeMetadata() {
    const theme = vscode.window.activeColorTheme;
    return {
      kind: theme.kind === vscode.ColorThemeKind.Dark ? 'dark' 
           : theme.kind === vscode.ColorThemeKind.Light ? 'light' 
           : theme.kind === vscode.ColorThemeKind.HighContrast ? 'high-contrast'
           : theme.kind === vscode.ColorThemeKind.HighContrastLight ? 'high-contrast-light'
           : 'unknown',
      name: 'current-theme'
    };
  }

  getSettingsMetadata() {
    const config = vscode.workspace.getConfiguration();
    
    return {
      telemetry: config.get('telemetry.telemetryLevel', 'unknown'),
      autoSave: config.get('files.autoSave', 'off'),
      formatOnSave: config.get('editor.formatOnSave', false),
      wordWrap: config.get('editor.wordWrap', 'off'),
      fontSize: config.get('editor.fontSize', 14),
      fontFamily: config.get('editor.fontFamily', 'monospace')
    };
  }

  getWorkspaceMetadata() {
    const folders = vscode.workspace.workspaceFolders || [];
    const workspaceFile = vscode.workspace.workspaceFile;

    let type = 'empty';
    if (workspaceFile) {
      type = 'workspace';
    } else if (folders.length === 1) {
      type = 'folder';
    } else if (folders.length > 1) {
      type = 'multi-root';
    }

    return {
      folders: folders.length,
      type,
      name: vscode.workspace.name || 'untitled'
    };
  }
}

module.exports = {
  EditorMetadataTracker
};
