const vscode = require('vscode');

class ExtensionTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.disposables = [];
    this.lastActiveExtensions = new Set();
    this.commandExecutions = new Map();
  }

  start() {
    console.log('[Saul Extension] Extension tracker started');
    this.dispose();

    this.captureInitialState();

    this.disposables.push(
      vscode.extensions.onDidChange(() => {
        const config = this.getConfig();
        if (!config.enableTelemetry) return;

        this.checkExtensionChanges();
      })
    );

    // VSCODE-013: Save interval reference for cleanup
    this.commandSamplerInterval = setInterval(() => {
      this.flushCommandStats();
    }, 60000);

    this.disposables.push({
      dispose: () => {
        if (this.commandSamplerInterval) {
          clearInterval(this.commandSamplerInterval);
        }
      }
    });

    this.interceptCommands();
  }

  captureInitialState() {
    vscode.extensions.all.forEach((ext) => {
      if (ext.isActive) {
        this.lastActiveExtensions.add(ext.id);
      }
    });
  }

  checkExtensionChanges() {
    const currentActive = new Set();
    
    vscode.extensions.all.forEach((ext) => {
      if (ext.isActive) {
        currentActive.add(ext.id);
      }
    });

    currentActive.forEach((extId) => {
      if (!this.lastActiveExtensions.has(extId)) {
        const heartbeat = this.buildHeartbeat({
          entityType: 'extension',
          entity: 'enable',
          category: 'extensions',
          isWrite: false,
          metadata: {
            extensionId: extId
          }
        });

        this.queue.enqueue(heartbeat);
        console.log(`[Saul Extension] Extension enabled: ${extId}`);
      }
    });

    this.lastActiveExtensions.forEach((extId) => {
      if (!currentActive.has(extId)) {
        const heartbeat = this.buildHeartbeat({
          entityType: 'extension',
          entity: 'disable',
          category: 'extensions',
          isWrite: false,
          metadata: {
            extensionId: extId
          }
        });

        this.queue.enqueue(heartbeat);
        console.log(`[Saul Extension] Extension disabled: ${extId}`);
      }
    });

    this.lastActiveExtensions = currentActive;
  }

  interceptCommands() {
    const originalExecuteCommand = vscode.commands.executeCommand;
    
    vscode.commands.executeCommand = async (command, ...rest) => {
      const config = this.getConfig();
      
      if (config.enableTelemetry && typeof command === 'string') {
        const extensionId = this.inferExtensionFromCommand(command);
        
        if (extensionId) {
          if (!this.commandExecutions.has(extensionId)) {
            this.commandExecutions.set(extensionId, new Map());
          }
          
          const extCommands = this.commandExecutions.get(extensionId);
          const count = (extCommands.get(command) || 0) + 1;
          extCommands.set(command, count);
        }
      }

      return originalExecuteCommand.call(vscode.commands, command, ...rest);
    };

    this.disposables.push({
      dispose: () => {
        vscode.commands.executeCommand = originalExecuteCommand;
      }
    });
  }

  inferExtensionFromCommand(command) {
    if (!command || typeof command !== 'string') return null;
    
    const parts = command.split('.');
    if (parts.length < 2) return null;

    if (command.startsWith('workbench.') || 
        command.startsWith('editor.') ||
        command.startsWith('vscode.')) {
      return 'vscode.builtin';
    }

    return parts.slice(0, 2).join('.');
  }

  flushCommandStats() {
    const config = this.getConfig();
    if (!config.enableTelemetry) return;

    this.commandExecutions.forEach((commands, extensionId) => {
      let totalCount = 0;
      const topCommands = [];

      commands.forEach((count, commandId) => {
        totalCount += count;
        topCommands.push({ commandId, count });
      });

      topCommands.sort((a, b) => b.count - a.count);
      const top5 = topCommands.slice(0, 5);

      if (totalCount > 0) {
        const heartbeat = this.buildHeartbeat({
          entityType: 'extension',
          entity: 'command_usage',
          category: 'extensions',
          isWrite: false,
          metadata: {
            extensionId,
            totalCommands: totalCount,
            topCommand: top5[0]?.commandId || 'unknown',
            topCommandCount: top5[0]?.count || 0
          }
        });

        this.queue.enqueue(heartbeat);
        console.log(`[Saul Extension] Commands: ${extensionId} - ${totalCount} total`);
      }
    });

    this.commandExecutions.clear();
  }

  dispose() {
    // VSCODE-013: Clear command sampler interval
    if (this.commandSamplerInterval) {
      clearInterval(this.commandSamplerInterval);
      this.commandSamplerInterval = null;
    }
    this.flushCommandStats();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.lastActiveExtensions.clear();
    this.commandExecutions.clear();
  }
}

module.exports = { ExtensionTracker };
