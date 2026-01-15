const vscode = require('vscode');
const { categorizeCommand } = require('../utils/privacy');

class TerminalTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.disposables = [];
    this.activeTerminals = new Map();
  }

  start() {
    console.log('[Saul Terminal] Terminal tracker started');
    this.dispose();

    this.disposables.push(
      vscode.window.onDidOpenTerminal((terminal) => {
        const config = this.getConfig();
        if (!config.enableTelemetry) return;

        this.activeTerminals.set(terminal, {
          openTime: Date.now(),
          shellType: this.getShellType(terminal)
        });

        const heartbeat = this.buildHeartbeat({
          entityType: 'terminal',
          entity: 'open',
          category: 'terminal',
          isWrite: false,
          metadata: {
            shellType: this.getShellType(terminal)
          }
        });

        this.queue.enqueue(heartbeat);
        console.log(`[Saul Terminal] Terminal opened: ${this.getShellType(terminal)}`);
      }),

      vscode.window.onDidCloseTerminal((terminal) => {
        const config = this.getConfig();
        if (!config.enableTelemetry) return;

        const termData = this.activeTerminals.get(terminal);
        const durationMs = termData ? Date.now() - termData.openTime : 0;

        const heartbeat = this.buildHeartbeat({
          entityType: 'terminal',
          entity: 'close',
          category: 'terminal',
          isWrite: false,
          metadata: {
            shellType: termData?.shellType || 'unknown',
            durationMs
          }
        });

        this.queue.enqueue(heartbeat);
        this.activeTerminals.delete(terminal);
        console.log(`[Saul Terminal] Terminal closed: duration=${durationMs}ms`);
      })
    );

    if (vscode.window.onDidStartTerminalShellExecution) {
      this.disposables.push(
        vscode.window.onDidStartTerminalShellExecution((event) => {
          const config = this.getConfig();
          if (!config.enableTelemetry) return;

          const commandLine = event.execution?.commandLine?.value;
          if (!commandLine) return;

          const category = categorizeCommand(commandLine);

          const heartbeat = this.buildHeartbeat({
            entityType: 'terminal',
            entity: 'command_start',
            category: 'terminal',
            isWrite: false,
            metadata: {
              commandCategory: category,
              shellType: this.getShellType(event.terminal)
            }
          });

          this.queue.enqueue(heartbeat);
          console.log(`[Saul Terminal] Command started: ${category}`);
        })
      );

      this.disposables.push(
        vscode.window.onDidEndTerminalShellExecution((event) => {
          const config = this.getConfig();
          if (!config.enableTelemetry) return;

          const commandLine = event.execution?.commandLine?.value;
          if (!commandLine) return;

          const category = categorizeCommand(commandLine);
          const durationMs = Date.now() - (event.execution?.startTime || Date.now());

          const heartbeat = this.buildHeartbeat({
            entityType: 'terminal',
            entity: 'command_end',
            category: 'terminal',
            isWrite: false,
            metadata: {
              commandCategory: category,
              exitCode: event.exitCode,
              durationMs,
              shellType: this.getShellType(event.terminal)
            }
          });

          this.queue.enqueue(heartbeat);
          console.log(`[Saul Terminal] Command ended: ${category}, exitCode=${event.exitCode}, duration=${durationMs}ms`);
        })
      );
    }
  }

  getShellType(terminal) {
    if (!terminal) return 'unknown';
    
    const name = terminal.name?.toLowerCase() || '';
    
    if (name.includes('bash')) return 'bash';
    if (name.includes('zsh')) return 'zsh';
    if (name.includes('powershell') || name.includes('pwsh')) return 'powershell';
    if (name.includes('cmd')) return 'cmd';
    if (name.includes('fish')) return 'fish';
    if (name.includes('sh')) return 'sh';
    
    return 'unknown';
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.activeTerminals.clear();
  }
}

module.exports = { TerminalTracker };
