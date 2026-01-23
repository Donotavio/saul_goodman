const vscode = require('vscode');
const path = require('path');

function registerExtraEventCollectors(options) {
  const { queue, getConfig, buildHeartbeat, context, resetIdleTimer } = options;
  const disposables = [];
  
  let lastActiveTab = null;
  let tabSwitchCount = 0;
  let commandExecutionCount = 0;
  const commandFrequency = new Map();

  const enqueue = (payload) => {
    const config = getConfig();
    if (!config.enableTracking) {
      return;
    }
    queue.enqueue(buildHeartbeat(payload));
  };

  disposables.push(
    vscode.window.tabGroups.onDidChangeTabs((event) => {
      const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
      
      if (activeTab && activeTab !== lastActiveTab) {
        if (resetIdleTimer) resetIdleTimer();
        tabSwitchCount++;
        lastActiveTab = activeTab;

        const tabLabel = activeTab.label || 'untitled';
        const tabKind = activeTab.input?.constructor?.name || 'unknown';

        enqueue({
          entityType: 'tab_switch',
          entity: tabLabel,
          category: 'navigation',
          isWrite: false,
          metadata: {
            eventType: 'tab_switched',
            tabKind,
            tabIndex: activeTab.group.activeTab?.group.tabs.indexOf(activeTab) || 0,
            totalTabs: activeTab.group.tabs.length,
            tabSwitchCount,
            windowFocused: vscode.window.state.focused
          }
        });
      }
    })
  );

  disposables.push(
    vscode.commands.registerCommand('saul.trackCommand', (commandId) => {
      if (resetIdleTimer) resetIdleTimer();
      commandExecutionCount++;
      const count = commandFrequency.get(commandId) || 0;
      commandFrequency.set(commandId, count + 1);

      enqueue({
        entityType: 'command',
        entity: commandId,
        category: 'command',
        isWrite: false,
        metadata: {
          eventType: 'command_executed',
          commandId,
          executionCount: count + 1,
          totalCommandExecutions: commandExecutionCount,
          windowFocused: vscode.window.state.focused
        }
      });
    })
  );

  const commandInterceptor = vscode.commands.registerCommand('workbench.action.quickOpen', async () => {
    if (resetIdleTimer) resetIdleTimer();
    enqueue({
      entityType: 'command_palette',
      entity: 'command_palette',
      category: 'navigation',
      isWrite: false,
      metadata: {
        eventType: 'command_palette_opened',
        windowFocused: vscode.window.state.focused
      }
    });
    return vscode.commands.executeCommand('workbench.action.quickOpen');
  });
  disposables.push(commandInterceptor);

  const periodicSummaryInterval = setInterval(() => {
    const config = getConfig();
    if (!config.enableTracking) {
      return;
    }

    const topCommands = Array.from(commandFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([cmd, count]) => ({ command: cmd, count }));

    enqueue({
      entityType: 'activity_summary',
      entity: 'user_activity',
      category: 'summary',
      isWrite: false,
      metadata: {
        eventType: 'periodic_activity_summary',
        tabSwitchCount,
        commandExecutionCount,
        topCommands,
        windowFocused: vscode.window.state.focused
      }
    });

    tabSwitchCount = 0;
    commandExecutionCount = 0;
    commandFrequency.clear();
  }, 30 * 60 * 1000);

  disposables.push({
    dispose: () => clearInterval(periodicSummaryInterval)
  });

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
