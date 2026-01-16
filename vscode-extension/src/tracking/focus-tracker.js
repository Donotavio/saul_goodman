const vscode = require('vscode');
const { getCurrentProjectName } = require('../utils/workspace-helper').default;

class FocusTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.comboTracker = options.comboTracker || null;
    this.disposables = [];
    this.isFocused = false;
    this.lastFocusTime = null;
    this.lastBlurTime = null;
    this.pomodoroInterval = null;
    this.lastRealActivity = Date.now();
    this.inactivityCheckInterval = null;
    this.lastPomodoroMinutes = 0; // Track last pomodoro check
  }

  start() {
    console.log('[Saul Focus] Focus tracker started');
    this.dispose();

    this.lastFocusTime = Date.now();

    this.disposables.push(
      vscode.window.onDidChangeWindowState((state) => {
        try {
          const config = this.getConfig();
          if (!config.enableTelemetry) return;

          const now = Date.now();
          const hour = new Date(now).getHours();
          this.lastRealActivity = now;

          if (state.focused && !this.isFocused) {
            this.isFocused = true;
            this.lastFocusTime = now;

            if (this.lastBlurTime) {
              const previousBlurDurationMs = now - this.lastBlurTime;
              const heartbeat = this.buildHeartbeat({
                entityType: 'window',
                entity: 'focus',
                project: getCurrentProjectName(),
                category: 'coding',
                isWrite: false,
                metadata: {
                  hourOfDay: hour,
                  previousBlurDurationMs
                }
              });
              this.queue.enqueue(heartbeat);
              console.log(`[Saul Focus] Window focused after ${Math.round(previousBlurDurationMs / 1000)}s blur`);
            }
          } else if (!state.focused && this.isFocused) {
            this.isFocused = false;
            this.lastBlurTime = now;

            if (this.lastFocusTime) {
              const focusDurationMs = now - this.lastFocusTime;
              const heartbeat = this.buildHeartbeat({
                entityType: 'window',
                entity: 'blur',
                project: getCurrentProjectName(),
                category: 'coding',
                isWrite: false,
                metadata: {
                  hourOfDay: hour,
                  focusDurationMs
                }
              });
              this.queue.enqueue(heartbeat);
              console.log(`[Saul Focus] Window blurred after ${Math.round(focusDurationMs / 1000)}s focus`);
            }
          }
        } catch (error) {
          console.error('[Saul Focus] Window state error:', error);
        }
      })
    );

    this.inactivityCheckInterval = setInterval(() => {
      const config = this.getConfig();
      if (!config.enableTelemetry) return;

      const now = Date.now();
      const inactivityDurationMs = now - this.lastRealActivity;
      if (inactivityDurationMs > config.inactivityTimeoutMs && this.isFocused) {
        this.isFocused = false;
        this.lastBlurTime = now;

        const heartbeat = this.buildHeartbeat({
          entityType: 'window',
          entity: 'blur',
          project: getCurrentProjectName(),
          category: 'coding',
          isWrite: false,
          metadata: {
            hourOfDay: new Date().getHours(),
            focusDurationMs: inactivityDurationMs
          }
        });
        this.queue.enqueue(heartbeat);
        console.log(`[Saul Focus] Window blurred after ${Math.round(inactivityDurationMs / 1000)}s inactivity`);
      }
    }, 60000);

    this.pomodoroInterval = setInterval(() => {
      const config = this.getConfig();
      if (!config.enableTelemetry) return;

      if (this.isFocused && this.lastFocusTime) {
        const focusDurationMs = Date.now() - this.lastFocusTime;
        const focusMinutes = Math.floor(focusDurationMs / 60000);

        if (focusMinutes > 0 && focusMinutes % 25 === 0 && focusMinutes !== this.lastPomodoroMinutes) {
          this.lastPomodoroMinutes = focusMinutes;
          
          const heartbeat = this.buildHeartbeat({
            entityType: 'window',
            entity: 'pomodoro_milestone',
            project: getCurrentProjectName(),
            category: 'coding',
            isWrite: false,
            metadata: {
              focusMinutes,
              hourOfDay: new Date().getHours()
            }
          });

          this.queue.enqueue(heartbeat);
          console.log(`[Saul Focus] Pomodoro milestone: ${focusMinutes} minutes`);
          
          // Notificar ComboTracker
          if (this.comboTracker) {
            this.comboTracker.onPomodoroCompleted().catch(err => {
              console.error('[Saul Focus] Error updating combo:', err);
            });
          }
        }
      }
    }, 60000);
  }

  dispose() {
    // VSCODE-001: Clear pomodoro interval
    if (this.pomodoroInterval) {
      clearInterval(this.pomodoroInterval);
      this.pomodoroInterval = null;
    }
    // BUG-FIX: Clear inactivity check interval
    if (this.inactivityCheckInterval) {
      clearInterval(this.inactivityCheckInterval);
      this.inactivityCheckInterval = null;
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

module.exports = { FocusTracker };
