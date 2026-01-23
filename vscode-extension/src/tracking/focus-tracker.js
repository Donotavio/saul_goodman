const vscode = require('vscode');
const { getCurrentProjectName } = require('../utils/workspace-helper').default;

class FocusTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.comboTracker = options.comboTracker || null;
    this.heartbeatTracker = options.heartbeatTracker || null;
    this.disposables = [];
    this.isFocused = false;
    this.lastFocusTime = null;
    this.lastBlurTime = null;
    this.pomodoroInterval = null;
    this.lastPomodoroMinutes = 0;
    this.lastIdleCheck = false;
  }

  start() {
    this.dispose();

    this.lastFocusTime = Date.now();

    this.disposables.push(
      vscode.window.onDidChangeWindowState((state) => {
        try {
          const config = this.getConfig();
          if (!config.enableTelemetry) return;

          const now = Date.now();
          const hour = new Date(now).getHours();

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
            }
          }
        } catch (error) {
          console.error('[Saul Focus] Window state error:', error);
        }
      })
    );

    this.pomodoroInterval = setInterval(() => {
      const config = this.getConfig();
      if (!config.enableTelemetry) return;

      // Verificar se HeartbeatTracker detectou idle
      const isCurrentlyIdle = this.heartbeatTracker && this.heartbeatTracker.isIdle;
      
      // Enviar blur event quando entrar em idle
      if (isCurrentlyIdle && !this.lastIdleCheck && this.isFocused) {
        this.isFocused = false;
        this.lastBlurTime = Date.now();
        const heartbeat = this.buildHeartbeat({
          entityType: 'window',
          entity: 'blur',
          project: getCurrentProjectName(),
          category: 'coding',
          isWrite: false,
          metadata: {
            hourOfDay: new Date().getHours(),
            reason: 'idle_detected'
          }
        });
        this.queue.enqueue(heartbeat);
      }
      
      // Restaurar focus quando sair de idle
      if (!isCurrentlyIdle && this.lastIdleCheck && !this.isFocused && vscode.window.state.focused) {
        this.isFocused = true;
        this.lastFocusTime = Date.now();
        const heartbeat = this.buildHeartbeat({
          entityType: 'window',
          entity: 'focus',
          project: getCurrentProjectName(),
          category: 'coding',
          isWrite: false,
          metadata: {
            hourOfDay: new Date().getHours(),
            reason: 'idle_exit'
          }
        });
        this.queue.enqueue(heartbeat);
      }
      
      this.lastIdleCheck = isCurrentlyIdle;

      if (this.isFocused && this.lastFocusTime && !isCurrentlyIdle) {
        const focusDurationMs = Date.now() - this.lastFocusTime;
        const focusMinutes = Math.floor(focusDurationMs / 60000);
        
        // Modo de teste: 1 minuto | Produção: 25 minutos
        const pomodoroInterval = config.pomodoroTestMode ? 1 : 25;

        if (focusMinutes > 0 && focusMinutes % pomodoroInterval === 0 && focusMinutes !== this.lastPomodoroMinutes) {
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
    if (this.pomodoroInterval) {
      clearInterval(this.pomodoroInterval);
      this.pomodoroInterval = null;
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

module.exports = { FocusTracker };
