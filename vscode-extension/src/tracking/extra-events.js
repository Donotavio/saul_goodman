const vscode = require('vscode');
const path = require('path');

function registerExtraEventCollectors(options) {
  const { queue, getConfig, buildHeartbeat, context } = options;
  const disposables = [];

  const enqueue = (payload) => {
    const config = getConfig();
    if (!config.enableTracking) {
      return;
    }
    queue.enqueue(buildHeartbeat(payload));
  };

  disposables.push(
    vscode.window.onDidOpenTerminal((terminal) => {
      enqueue({
        entityType: 'terminal',
        entity: terminal.name || 'terminal',
        category: 'terminal',
        isWrite: false,
        metadata: { windowFocused: vscode.window.state.focused }
      });
    }),
    vscode.window.onDidCloseTerminal((terminal) => {
      enqueue({
        entityType: 'terminal',
        entity: terminal.name || 'terminal',
        category: 'terminal',
        isWrite: false,
        metadata: { windowFocused: vscode.window.state.focused }
      });
    })
  );

  disposables.push(
    vscode.debug.onDidStartDebugSession((session) => {
      enqueue({
        entityType: 'debug',
        entity: session.name || 'debug',
        category: 'debugging',
        isWrite: false,
        metadata: { windowFocused: vscode.window.state.focused }
      });
    }),
    vscode.debug.onDidTerminateDebugSession((session) => {
      enqueue({
        entityType: 'debug',
        entity: session.name || 'debug',
        category: 'debugging',
        isWrite: false,
        metadata: { windowFocused: vscode.window.state.focused }
      });
    })
  );

  if (vscode.tasks?.onDidStartTaskProcess) {
    disposables.push(
      vscode.tasks.onDidStartTaskProcess((event) => {
        enqueue({
          entityType: 'task',
          entity: resolveTaskLabel(event.execution?.task),
          project: resolveTaskProject(event.execution?.task),
          category: 'building',
          isWrite: false,
          metadata: {
            commandId: event.execution?.task?.definition?.type,
            windowFocused: vscode.window.state.focused
          }
        });
      }),
      vscode.tasks.onDidEndTaskProcess((event) => {
        enqueue({
          entityType: 'task',
          entity: resolveTaskLabel(event.execution?.task),
          project: resolveTaskProject(event.execution?.task),
          category: 'building',
          isWrite: false,
          metadata: {
            commandId: event.execution?.task?.definition?.type,
            exitCode: event.exitCode,
            windowFocused: vscode.window.state.focused
          }
        });
      })
    );
  }

  if (vscode.tests?.onDidStartTestRun) {
    disposables.push(
      vscode.tests.onDidStartTestRun((run) => {
        enqueue({
          entityType: 'test',
          entity: run.name || 'tests',
          category: 'testing',
          isWrite: false,
          metadata: { windowFocused: vscode.window.state.focused }
        });
      }),
      vscode.tests.onDidEndTestRun((run) => {
        enqueue({
          entityType: 'test',
          entity: run.name || 'tests',
          category: 'testing',
          isWrite: false,
          metadata: {
            windowFocused: vscode.window.state.focused,
            passed: run.passed,
            failed: run.failed,
            skipped: run.skipped
          }
        });
      })
    );
  }

  context.subscriptions.push({ dispose: () => disposables.forEach((item) => item.dispose()) });
  return disposables;
}

function resolveTaskLabel(task) {
  if (!task) {
    return 'task';
  }
  return task.name || task._definition?.label || task.definition?.type || 'task';
}

function resolveTaskProject(task) {
  const workspaceFolder = task?.scope && typeof task.scope === 'object' && task.scope.uri
    ? task.scope
    : vscode.workspace.workspaceFolders?.[0];
  if (workspaceFolder?.name) {
    return workspaceFolder.name;
  }
  if (workspaceFolder?.uri?.fsPath) {
    return path.basename(workspaceFolder.uri.fsPath);
  }
  return '';
}

module.exports = {
  registerExtraEventCollectors
};
