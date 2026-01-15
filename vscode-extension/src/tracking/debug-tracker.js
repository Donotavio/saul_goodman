const vscode = require('vscode');
const { anonymizePath, getOrCreateHashSalt } = require('../utils/privacy');

class DebugTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.disposables = [];
    this.activeSessions = new Map();
  }

  start() {
    console.log('[Saul Debug] Debug tracker started');
    this.dispose();

    const salt = getOrCreateHashSalt(this.context);

    this.disposables.push(
      vscode.debug.onDidStartDebugSession((session) => {
        const config = this.getConfig();
        if (!config.enableTelemetry) return;

        const startTime = Date.now();
        this.activeSessions.set(session.id, { startTime, type: session.type });

        const heartbeat = this.buildHeartbeat({
          entityType: 'debug_session',
          entity: 'start',
          category: 'debugging',
          isWrite: false,
          metadata: {
            debugType: session.type || 'unknown',
            sessionId: session.id.substring(0, 8)
          }
        });

        this.queue.enqueue(heartbeat);
        console.log(`[Saul Debug] Session started: ${session.type}`);
      }),

      vscode.debug.onDidTerminateDebugSession((session) => {
        const config = this.getConfig();
        if (!config.enableTelemetry) return;

        const sessionData = this.activeSessions.get(session.id);
        const durationMs = sessionData ? Date.now() - sessionData.startTime : 0;
        
        const heartbeat = this.buildHeartbeat({
          entityType: 'debug_session',
          entity: 'stop',
          category: 'debugging',
          isWrite: false,
          metadata: {
            debugType: session.type || 'unknown',
            sessionId: session.id.substring(0, 8),
            durationMs
          }
        });

        this.queue.enqueue(heartbeat);
        this.activeSessions.delete(session.id);
        console.log(`[Saul Debug] Session stopped: ${session.type}, duration: ${durationMs}ms`);
      }),

      vscode.debug.onDidChangeBreakpoints((event) => {
        const config = this.getConfig();
        if (!config.enableTelemetry) return;

        if (event.added.length > 0) {
          event.added.forEach((bp) => {
            const fileId = bp.location?.uri?.fsPath ? anonymizePath(bp.location.uri.fsPath, salt) : 'unknown';
            
            const heartbeat = this.buildHeartbeat({
              entityType: 'debug_breakpoint',
              entity: 'add',
              category: 'debugging',
              isWrite: false,
              metadata: {
                fileId,
                line: bp.location?.range?.start?.line
              }
            });

            this.queue.enqueue(heartbeat);
          });
          console.log(`[Saul Debug] Breakpoints added: ${event.added.length}`);
        }

        if (event.removed.length > 0) {
          event.removed.forEach((bp) => {
            const fileId = bp.location?.uri?.fsPath ? anonymizePath(bp.location.uri.fsPath, salt) : 'unknown';
            
            const heartbeat = this.buildHeartbeat({
              entityType: 'debug_breakpoint',
              entity: 'remove',
              category: 'debugging',
              isWrite: false,
              metadata: {
                fileId,
                line: bp.location?.range?.start?.line
              }
            });

            this.queue.enqueue(heartbeat);
          });
          console.log(`[Saul Debug] Breakpoints removed: ${event.removed.length}`);
        }
      })
    );
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.activeSessions.clear();
  }
}

module.exports = { DebugTracker };
