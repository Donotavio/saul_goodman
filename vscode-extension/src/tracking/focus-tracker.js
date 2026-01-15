const vscode = require('vscode');

class FocusTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.disposables = [];
    this.lastFocusTime = null;
    this.lastBlurTime = null;
    this.isFocused = true;
  }

  start() {
    console.log('[Saul Focus] Focus tracker started');
    this.dispose();

    this.lastFocusTime = Date.now();

    this.disposables.push(
      vscode.window.onDidChangeWindowState((state) => {
        const config = this.getConfig();
        if (!config.enableTelemetry) return;

        const now = Date.now();
        const hour = new Date(now).getHours();

        if (state.focused && !this.isFocused) {
          const blurDurationMs = this.lastBlurTime ? now - this.lastBlurTime : 0;

          const heartbeat = this.buildHeartbeat({
            entityType: 'window',
            entity: 'focus',
            category: 'focus',
            isWrite: false,
            metadata: {
              hourOfDay: hour,
              previousBlurDurationMs: blurDurationMs
            }
          });

          this.queue.enqueue(heartbeat);
          this.lastFocusTime = now;
          this.isFocused = true;
          
          console.log(`[Saul Focus] Window focused after ${blurDurationMs}ms blur`);
        } 
        else if (!state.focused && this.isFocused) {
          const focusDurationMs = this.lastFocusTime ? now - this.lastFocusTime : 0;

          const heartbeat = this.buildHeartbeat({
            entityType: 'window',
            entity: 'blur',
            category: 'focus',
            isWrite: false,
            metadata: {
              hourOfDay: hour,
              focusDurationMs
            }
          });

          this.queue.enqueue(heartbeat);
          this.lastBlurTime = now;
          this.isFocused = false;

          console.log(`[Saul Focus] Window blurred after ${focusDurationMs}ms focus`);
        }
      })
    );

    const pomodoroCheckInterval = setInterval(() => {
      const config = this.getConfig();
      if (!config.enableTelemetry) return;

      if (this.isFocused && this.lastFocusTime) {
        const focusDurationMs = Date.now() - this.lastFocusTime;
        const focusMinutes = Math.floor(focusDurationMs / 60000);

        if (focusMinutes > 0 && focusMinutes % 25 === 0) {
          const heartbeat = this.buildHeartbeat({
            entityType: 'window',
            entity: 'pomodoro_milestone',
            category: 'focus',
            isWrite: false,
            metadata: {
              focusMinutes,
              hourOfDay: new Date().getHours()
            }
          });

          this.queue.enqueue(heartbeat);
          console.log(`[Saul Focus] Pomodoro milestone: ${focusMinutes} minutes`);
        }
      }
    }, 60000);

    this.disposables.push({
      dispose: () => clearInterval(pomodoroCheckInterval)
    });
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

module.exports = { FocusTracker };
