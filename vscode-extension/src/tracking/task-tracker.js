const vscode = require('vscode');
const { getCurrentProjectName } = require('../utils/workspace-helper').default;

class TaskTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.disposables = [];
    this.activeExecutions = new Map();
  }

  start() {
    try {
      console.log('[Saul Task] Task tracker started');
      this.dispose();

      this.disposables.push(
        vscode.tasks.onDidStartTask((event) => {
          try {
            const config = this.getConfig();
            if (!config.enableTelemetry) return;

            const task = event.execution.task;
            const taskName = this.normalizeTaskName(task.name);
            const taskGroup = this.getTaskGroup(task);

            this.activeExecutions.set(event.execution, {
              startTime: Date.now(),
              taskName,
              taskGroup
            });

            const heartbeat = this.buildHeartbeat({
              entityType: 'task',
              entity: 'start',
              project: getCurrentProjectName(),
              category: 'building',
              isWrite: false,
              metadata: {
                taskName,
                taskGroup,
                source: task.source
              }
            });

            this.queue.enqueue(heartbeat);
            console.log(`[Saul Task] Task started: ${taskName} (${taskGroup})`);
          } catch (error) {
            console.error('[Saul Task] Start task error:', error);
          }
        }),

        vscode.tasks.onDidEndTask((event) => {
          try {
            const config = this.getConfig();
            if (!config.enableTelemetry) return;

            const execData = this.activeExecutions.get(event.execution);
            if (!execData) return;

            this.activeExecutions.delete(event.execution);
          } catch (error) {
            console.error('[Saul Task] End task error:', error);
          }
        }),

        vscode.tasks.onDidStartTaskProcess((event) => {
          try {
            const config = this.getConfig();
            if (!config.enableTelemetry) return;

            let execData = this.activeExecutions.get(event.execution);
            if (!execData) {
              const task = event.execution?.task;
              const taskName = this.normalizeTaskName(task?.name);
              const taskGroup = this.getTaskGroup(task ?? { name: taskName });

              execData = {
                startTime: Date.now(),
                taskName,
                taskGroup,
                processId: event.processId
              };
              this.activeExecutions.set(event.execution, execData);

              const startHeartbeat = this.buildHeartbeat({
                entityType: 'task',
                entity: 'start',
                project: getCurrentProjectName(),
                category: 'building',
                isWrite: false,
                metadata: {
                  taskName,
                  taskGroup,
                  source: task?.source
                }
              });
              this.queue.enqueue(startHeartbeat);
              console.log(`[Saul Task] Task started (process): ${taskName} (${taskGroup})`);
              return;
            }

            execData.processId = event.processId;
          } catch (error) {
            console.error('[Saul Task] Start task process error:', error);
          }
        }),

        vscode.tasks.onDidEndTaskProcess((event) => {
          try {
            const config = this.getConfig();
            if (!config.enableTelemetry) return;

            const execData = this.activeExecutions.get(event.execution);
            if (!execData) return;

            const durationMs = Date.now() - execData.startTime;

            const heartbeat = this.buildHeartbeat({
              entityType: 'task',
              entity: 'process_end',
              project: getCurrentProjectName(),
              category: 'building',
              isWrite: false,
              metadata: {
                taskName: execData.taskName,
                taskGroup: execData.taskGroup,
                durationMs,
                exitCode: event.exitCode
              }
            });

            this.queue.enqueue(heartbeat);
            console.log(`[Saul Task] Task process ended: ${execData.taskName}, exitCode: ${event.exitCode}`);

            this.activeExecutions.delete(event.execution);
          } catch (error) {
            console.error('[Saul Task] End task process error:', error);
          }
        })
      );
    } catch (error) {
      console.error('[Saul Task] Start failed:', error);
    }
  }

  normalizeTaskName(name) {
    if (!name) return 'unknown';
    return name.toLowerCase().replace(/[^a-z0-9-_]/g, '_').substring(0, 50);
  }

  getTaskGroup(task) {
    if (task.group === vscode.TaskGroup.Build) return 'build';
    if (task.group === vscode.TaskGroup.Test) return 'test';
    if (task.group === vscode.TaskGroup.Clean) return 'clean';
    
    const name = task.name.toLowerCase();
    if (name.includes('build')) return 'build';
    if (name.includes('test')) return 'test';
    if (name.includes('deploy')) return 'deploy';
    if (name.includes('lint')) return 'lint';
    
    return 'other';
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.activeExecutions.clear();
  }
}

module.exports = { TaskTracker };
