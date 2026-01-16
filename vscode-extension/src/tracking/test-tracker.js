const vscode = require('vscode');
const { getCurrentProjectName } = require('../utils/workspace-helper');
const { anonymizePath, getOrCreateHashSalt } = require('../utils/privacy');

class TestTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.disposables = [];
    this.activeRuns = new Map();
  }

  start() {
    console.log('[Saul Test] Test tracker started');
    this.dispose();

    if (vscode.window.onDidEndTerminalShellExecution) {
      this.disposables.push(
        vscode.window.onDidEndTerminalShellExecution((event) => {
          const config = this.getConfig();
          if (!config.enableTelemetry) return;

          const commandLine = event.execution?.commandLine?.value;
          if (!commandLine) return;

          const isTestCommand = this.isTestCommand(commandLine);
          if (!isTestCommand) return;

          const durationMs = Date.now() - (event.execution?.startTime || Date.now());
          const exitCode = event.exitCode;

          const heartbeat = this.buildHeartbeat({
            entityType: 'test_run',
            entity: 'complete',
            project: getCurrentProjectName(),
            category: 'testing',
            isWrite: false,
            metadata: {
              exitCode,
              durationMs,
              passed: exitCode === 0 ? 1 : 0,
              failed: exitCode !== 0 ? 1 : 0,
              skipped: 0
            }
          });

          this.queue.enqueue(heartbeat);
          console.log(`[Saul Test] Test command completed: exitCode=${exitCode}, duration=${durationMs}ms`);
        })
      );
    }
  }

  isTestCommand(commandLine) {
    const cmd = commandLine.toLowerCase();
    return cmd.includes('test') || 
           cmd.includes('jest') || 
           cmd.includes('mocha') || 
           cmd.includes('pytest') ||
           cmd.includes('vitest') ||
           cmd.includes('cargo test') ||
           cmd.includes('go test');
  }

  flushActiveRuns() {
    const salt = getOrCreateHashSalt(this.context);
    
    this.activeRuns.forEach((runData, runId) => {
      const durationMs = Date.now() - runData.startTime;

      const heartbeat = this.buildHeartbeat({
        entityType: 'test_run',
        entity: 'complete',
        project: getCurrentProjectName(),
        category: 'testing',
        isWrite: false,
        metadata: {
          passed: runData.passed,
          failed: runData.failed,
          skipped: runData.skipped,
          durationMs
        }
      });

      this.queue.enqueue(heartbeat);
    });

    this.activeRuns.clear();
  }

  dispose() {
    this.flushActiveRuns();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

module.exports = { TestTracker };
