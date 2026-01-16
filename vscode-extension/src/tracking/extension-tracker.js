const vscode = require('vscode');
const { getCurrentProjectName } = require('../utils/workspace-helper').default;

class ExtensionTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.disposables = [];
    this.lastActiveExtensions = new Set();
    this.commandExecutions = new Map();
    this.commandToExtensionMap = new Map();
  }

  start() {
    try {
      console.log('[Saul Extension] Extension tracker started');
      this.dispose();

      // Defer heavy initialization to avoid blocking activation
      setTimeout(() => {
        try {
          this.buildCommandToExtensionMap();
          this.captureInitialState();
          console.log('[Saul Extension] Initial state captured');
        } catch (error) {
          console.error('[Saul Extension] Deferred init error:', error);
        }
      }, 5000);

      this.disposables.push(
        vscode.extensions.onDidChange(() => {
          try {
            const config = this.getConfig();
            if (!config.enableTelemetry) return;

            this.buildCommandToExtensionMap();
            this.checkExtensionChanges();
          } catch (error) {
            console.error('[Saul Extension] Extension change error:', error);
          }
        })
      );

      // VSCODE-013: Save interval reference for cleanup
      this.commandSamplerInterval = setInterval(() => {
        try {
          this.flushCommandStats();
        } catch (error) {
          console.error('[Saul Extension] Flush stats error:', error);
        }
      }, 60000);

      this.disposables.push({
        dispose: () => {
          if (this.commandSamplerInterval) {
            clearInterval(this.commandSamplerInterval);
          }
        }
      });

      // Defer command interception to avoid blocking activation
      setTimeout(() => {
        try {
          this.interceptCommands();
          console.log('[Saul Extension] Command interception enabled');
        } catch (error) {
          console.error('[Saul Extension] Command interception error:', error);
        }
      }, 3000);
    } catch (error) {
      console.error('[Saul Extension] Start failed:', error);
    }
  }

  buildCommandToExtensionMap() {
    this.commandToExtensionMap.clear();
    
    vscode.extensions.all.forEach((ext) => {
      const packageJSON = ext.packageJSON;
      
      if (packageJSON && packageJSON.contributes && packageJSON.contributes.commands) {
        const commands = packageJSON.contributes.commands;
        
        if (Array.isArray(commands)) {
          commands.forEach((cmd) => {
            if (cmd.command) {
              this.commandToExtensionMap.set(cmd.command, ext.id);
            }
          });
        }
      }
    });
    
    console.log(`[Saul Extension] Built command map with ${this.commandToExtensionMap.size} commands from ${vscode.extensions.all.length} extensions`);
    
    try {
      const saulOpenReports = this.commandToExtensionMap.get('saulGoodman.openReports');
      const saulStartDaemon = this.commandToExtensionMap.get('saulGoodman.startDaemon');
      const saulTestDaemon = this.commandToExtensionMap.get('saulGoodman.testDaemon');
      console.log(`[Saul Extension] Saul commands → openReports: ${saulOpenReports || 'NOT FOUND'}, startDaemon: ${saulStartDaemon || 'NOT FOUND'}, testDaemon: ${saulTestDaemon || 'NOT FOUND'}`);
    } catch (err) {
      console.error('[Saul Extension] Error checking Saul commands:', err);
    }
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
          project: getCurrentProjectName(),
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
          project: getCurrentProjectName(),
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
      // Log ALL Saul commands unconditionally for debugging
      if (typeof command === 'string' && command.startsWith('saulGoodman.')) {
        console.log(`[Saul Extension] 🔍 Intercepted Saul command: "${command}"`);
      }
      
      const config = this.getConfig();
      
      if (config.enableTelemetry && typeof command === 'string') {
        const extensionId = this.inferExtensionFromCommand(command);
        
        // Log Saul commands for debugging
        if (command.startsWith('saulGoodman.')) {
          console.log(`[Saul Extension] 🔍 Saul command executed: "${command}" → Extension: "${extensionId}"`);
        }
        
        if (extensionId) {
          if (!this.commandExecutions.has(extensionId)) {
            this.commandExecutions.set(extensionId, new Map());
          }
          
          const extCommands = this.commandExecutions.get(extensionId);
          const count = (extCommands.get(command) || 0) + 1;
          extCommands.set(command, count);
          
          // Log when Saul commands are stored
          if (command.startsWith('saulGoodman.')) {
            console.log(`[Saul Extension] ✓ Stored command count: ${count} for extension: ${extensionId}`);
          }
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

  trackCommand(command, extensionId) {
    if (!command || !extensionId) return;
    
    console.log(`[Saul Extension] 📝 Manually tracking command: "${command}" → "${extensionId}"`);
    
    if (!this.commandExecutions.has(extensionId)) {
      this.commandExecutions.set(extensionId, new Map());
    }
    
    const extCommands = this.commandExecutions.get(extensionId);
    const count = (extCommands.get(command) || 0) + 1;
    extCommands.set(command, count);
    
    console.log(`[Saul Extension] ✓ Command stored: ${count} executions`);
  }

  inferExtensionFromCommand(command) {
    if (!command || typeof command !== 'string') return null;
    
    // First check if we have an exact mapping from extension manifest
    if (this.commandToExtensionMap.has(command)) {
      return this.commandToExtensionMap.get(command);
    }
    
    // If command starts with underscore or default:, it's internal
    if (command.startsWith('_') || command.startsWith('default:')) {
      return 'vscode.builtin';
    }
    
    const parts = command.split('.');
    
    // Commands with less than 2 parts are likely builtin
    if (parts.length < 2) {
      return 'vscode.builtin';
    }

    // Only classify as builtin if it's a known VSCode core namespace
    // Be more conservative here to catch extension commands
    const builtinPrefixes = ['workbench.action', 'editor.action', 'vscode.', 'list.', 'notebook.cell'];
    const isBuiltin = builtinPrefixes.some(prefix => command.startsWith(prefix));
    
    if (isBuiltin) {
      return 'vscode.builtin';
    }

    // For commands like "git.commit", check if git extension is installed
    // Otherwise assume it's an extension command with prefix as extension ID
    const possibleExtId = parts[0];
    
    // Check if this is a known extension
    const ext = vscode.extensions.all.find(e => 
      e.id === possibleExtId || 
      e.id.endsWith('.' + possibleExtId) ||
      e.id.startsWith(possibleExtId)
    );
    
    if (ext) {
      return ext.id;
    }
    
    // Default to the prefix as extension ID
    return possibleExtId;
  }

  flushCommandStats() {
    const config = this.getConfig();
    if (!config.enableTelemetry) return;

    console.log(`[Saul Extension] Flushing stats for ${this.commandExecutions.size} extensions`);

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
          project: getCurrentProjectName(),
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
        console.log(`[Saul Extension] Flush → ${extensionId}: ${totalCount} cmds (top: ${top5[0]?.commandId})`);
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
