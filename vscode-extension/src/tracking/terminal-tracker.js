const { window } = require('vscode');
const { getCurrentProjectName } = require('../utils/workspace-helper').default;
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
    try {
      console.log('[Saul Terminal] Terminal tracker started');
      this.dispose();

      this.disposables.push(
        window.onDidOpenTerminal((terminal) => {
          try {
            const config = this.getConfig();
            if (!config.enableTelemetry) return;

            this.activeTerminals.set(terminal, {
              openTime: Date.now(),
              shellType: this.getShellType(terminal)
            });

            const heartbeat = this.buildHeartbeat({
              entityType: 'terminal',
              entity: 'open',
              project: getCurrentProjectName(),
              category: 'terminal',
              isWrite: false,
              metadata: {
                shellType: this.getShellType(terminal)
              }
            });

            this.queue.enqueue(heartbeat);
            console.log(`[Saul Terminal] Terminal opened: ${this.getShellType(terminal)}`);
          } catch (error) {
            console.error('[Saul Terminal] Open terminal error:', error);
          }
        }),

        window.onDidCloseTerminal((terminal) => {
          try {
            const config = this.getConfig();
            if (!config.enableTelemetry) return;

            const termData = this.activeTerminals.get(terminal);
            const durationMs = termData ? Date.now() - termData.openTime : 0;

            const heartbeat = this.buildHeartbeat({
              entityType: 'terminal',
              entity: 'close',
              project: getCurrentProjectName(),
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
          } catch (error) {
            console.error('[Saul Terminal] Close terminal error:', error);
          }
        })
      );

      if (window.onDidStartTerminalShellExecution) {
        this.disposables.push(
          window.onDidStartTerminalShellExecution((event) => {
            try {
              const config = this.getConfig();
              if (!config.enableTelemetry) return;

              const commandLine = event.execution?.commandLine?.value;
              if (!commandLine) return;

              const category = categorizeCommand(commandLine);
              
              // Filter sensitive data if not authorized
              const metadata = {
                commandCategory: category,
                shellType: this.getShellType(event.terminal)
              };
              
              if (config.enableSensitiveTelemetry) {
                metadata.commandLine = commandLine;
              }

              const heartbeat = this.buildHeartbeat({
                entityType: 'terminal',
                entity: 'command_start',
                project: getCurrentProjectName(),
                category: 'terminal',
                isWrite: false,
                metadata
              });

              this.queue.enqueue(heartbeat);
              console.log(`[Saul Terminal] Command started: ${category}`);
            } catch (error) {
              console.error('[Saul Terminal] Command start error:', error);
            }
          })
        );

        this.disposables.push(
          window.onDidEndTerminalShellExecution((event) => {
            try {
              const config = this.getConfig();
              if (!config.enableTelemetry) return;

              const commandLine = event.execution?.commandLine?.value;
              if (!commandLine) return;

              const category = categorizeCommand(commandLine);
              const durationMs = Date.now() - (event.execution?.startTime || Date.now());
              
              // Filter sensitive data if not authorized
              const metadata = {
                commandCategory: category,
                exitCode: event.exitCode,
                durationMs,
                shellType: this.getShellType(event.terminal)
              };
              
              if (config.enableSensitiveTelemetry) {
                metadata.commandLine = commandLine;
              }

              const heartbeat = this.buildHeartbeat({
                entityType: 'terminal',
                entity: 'command_end',
                project: getCurrentProjectName(),
                category: 'terminal',
                isWrite: false,
                metadata
              });

              this.queue.enqueue(heartbeat);
              console.log(`[Saul Terminal] Command ended: ${category}, exitCode=${event.exitCode}, duration=${durationMs}ms`);
            } catch (error) {
              console.error('[Saul Terminal] Command end error:', error);
            }
          })
        );
      }
    } catch (error) {
      console.error('[Saul Terminal] Start failed:', error);
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
