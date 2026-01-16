const vscode = require('vscode');
const { getCurrentProjectName } = require('../utils/workspace-helper');

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
    
    console.log('[Saul Metadata] EditorMetadataTracker started');
    
    console.log('[Saul Metadata] EditorMetadataTracker started, will send metadata in 2 seconds');
    
    // VSCODE-010: Save timer references for cleanup
    this.initialTimer = setTimeout(() => {
      console.log('[Saul Metadata] Sending initial editor metadata...');
      this.sendEditorMetadata();
    }, 2000);
    
    this.metadataInterval = setInterval(() => {
      console.log('[Saul Metadata] Sending periodic editor metadata...');
      this.sendEditorMetadata();
    }, this.METADATA_INTERVAL_MS);

    this.disposables.push({
      dispose: () => clearInterval(this.metadataInterval)
    });

    this.disposables.push({
      dispose: () => clearTimeout(this.initialTimer)
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

  sendEditorMetadata() {
    const config = this.getConfig();
    if (!config.enableTracking) {
      console.log('[Saul Metadata] Tracking disabled');
      return;
    }

    const now = Date.now();
    if (now - this.lastMetadataSentAt < this.METADATA_INTERVAL_MS) {
      console.log('[Saul Metadata] Skipping - too soon since last send');
      return;
    }
    this.lastMetadataSentAt = now;

    console.log('[Saul Metadata] Collecting editor metadata...');
    const metadata = this.collectEditorMetadata();
    console.log('[Saul Metadata] Extensions found:', metadata.extensionsCount);
    
    const heartbeat = this.buildHeartbeat({
      entityType: 'editor_metadata',
      entity: 'vscode',
      project: getCurrentProjectName(),
      category: 'coding',
      isWrite: false,
      metadata
    });

    console.log('[Saul Metadata] Enqueueing editor metadata heartbeat');
    this.queue.enqueue(heartbeat);
    console.log('[Saul Metadata] Editor metadata sent');
  }

  collectEditorMetadata() {
    const extensions = this.getExtensionsMetadata();
    const theme = this.getThemeMetadata();
    const settings = this.getSettingsMetadata();
    const workspace = this.getWorkspaceMetadata();

    return {
      eventType: 'editor_metadata_snapshot',
      vscodeVersion: vscode.env.appName + ' ' + (vscode.env.appHost || 'desktop'),
      vscodeLanguage: vscode.env.language,
      extensionsCount: extensions.count,
      extensionsEnabled: extensions.enabled,
      extensionsDisabled: extensions.disabled,
      topExtensions: extensions.top.slice(0, 10),
      themeKind: theme.kind,
      themeName: theme.name,
      settingsAutoSave: settings.autoSave,
      settingsFormatOnSave: settings.formatOnSave,
      workspaceFolders: workspace.folders,
      workspaceType: workspace.type,
      workspaceName: workspace.name
    };
  }

  getExtensionsMetadata() {
    try {
      const allExtensions = vscode.extensions.all;
      const userExtensions = allExtensions.filter((ext) => {
        return ext.packageJSON && !ext.packageJSON.isBuiltin;
      });
      
      const enabled = userExtensions.length;
      const disabled = 0;

      const top = userExtensions
        .slice(0, 10)
        .map((ext) => ({
          id: ext.id,
          version: ext.packageJSON?.version || '0.0.0',
          publisher: ext.packageJSON?.publisher || 'unknown'
        }));

      return {
        count: userExtensions.length,
        enabled,
        disabled,
        top
      };
    } catch (error) {
      console.error('[Saul Metadata] Error getting extensions:', error);
      return { count: 0, enabled: 0, disabled: 0, top: [] };
    }
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
    let name = 'No workspace';
    
    if (workspaceFile) {
      type = 'workspace';
      name = vscode.workspace.name || 'workspace';
    } else if (folders.length === 1) {
      type = 'folder';
      name = folders[0].name;
    } else if (folders.length > 1) {
      type = 'multi-root';
      name = folders.map(f => f.name).join(', ');
    }

    return {
      folders: folders.length,
      type,
      name
    };
  }

  // VSCODE-010: Add dispose method
  dispose() {
    if (this.metadataInterval) {
      clearInterval(this.metadataInterval);
      this.metadataInterval = null;
    }
    if (this.initialTimer) {
      clearTimeout(this.initialTimer);
      this.initialTimer = null;
    }
    this.disposables.forEach((item) => item.dispose());
    this.disposables = [];
  }
}

module.exports = {
  EditorMetadataTracker
};
