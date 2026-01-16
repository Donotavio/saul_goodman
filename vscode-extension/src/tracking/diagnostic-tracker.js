const vscode = require('vscode');
const { getOrCreateHashSalt } = require('../utils/identity');
const { anonymizePath } = require('../utils/privacy');
const { getCurrentProjectName } = require('../utils/workspace-helper');

const DEFAULT_SAMPLE_INTERVAL_SEC = 60;

class DiagnosticTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.disposables = [];
    this.sampleTimer = null;
    this.lastSnapshot = new Map();
  }

  start() {
    console.log('[Saul Diagnostic] Diagnostic tracker started');
    this.dispose();

    const config = this.getConfig();
    const intervalSec = config.telemetrySampleDiagnosticsIntervalSec || DEFAULT_SAMPLE_INTERVAL_SEC;

    this.sampleTimer = setInterval(() => {
      this.sampleDiagnostics();
    }, intervalSec * 1000);

    this.disposables.push({
      dispose: () => {
        if (this.sampleTimer) {
          clearInterval(this.sampleTimer);
          this.sampleTimer = null;
        }
      }
    });

    this.sampleDiagnostics();
  }

  sampleDiagnostics() {
    const config = this.getConfig();
    if (!config.enableTelemetry) return;

    const salt = getOrCreateHashSalt(this.context);
    const currentSnapshot = new Map();

    vscode.workspace.textDocuments.forEach((document) => {
      if (document.isUntitled || document.uri.scheme !== 'file') {
        return;
      }

      const diagnostics = vscode.languages.getDiagnostics(document.uri);
      if (diagnostics.length === 0) {
        return;
      }

      const fileId = anonymizePath(document.uri.fsPath, salt);
      
      let errors = 0;
      let warnings = 0;
      let infos = 0;
      let hints = 0;

      diagnostics.forEach((diag) => {
        switch (diag.severity) {
          case vscode.DiagnosticSeverity.Error:
            errors++;
            break;
          case vscode.DiagnosticSeverity.Warning:
            warnings++;
            break;
          case vscode.DiagnosticSeverity.Information:
            infos++;
            break;
          case vscode.DiagnosticSeverity.Hint:
            hints++;
            break;
        }
      });

      currentSnapshot.set(fileId, { errors, warnings, infos, hints });

      const previous = this.lastSnapshot.get(fileId);
      const hasChanged = !previous || 
                        previous.errors !== errors || 
                        previous.warnings !== warnings;

      if (hasChanged && (errors > 0 || warnings > 0)) {
        const heartbeat = this.buildHeartbeat({
          entityType: 'diagnostic',
          entity: 'snapshot',
          project: getCurrentProjectName(),
          category: 'quality',
          isWrite: false,
          metadata: {
            fileId,
            errors,
            warnings,
            infos,
            hints,
            previousErrors: previous?.errors || 0,
            previousWarnings: previous?.warnings || 0
          }
        });

        this.queue.enqueue(heartbeat);
        console.log(`[Saul Diagnostic] Snapshot: ${fileId} - errors=${errors}, warnings=${warnings}`);
      }
    });

    this.lastSnapshot = currentSnapshot;
  }

  dispose() {
    // VSCODE-011: Clear sample timer
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.lastSnapshot.clear();
  }
}

module.exports = { DiagnosticTracker };
