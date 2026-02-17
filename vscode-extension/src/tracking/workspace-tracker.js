const vscode = require('vscode');
const fs = require('fs');
const path = require('path');
const { getCurrentProjectName } = require('../utils/workspace-helper').default;
const WORKSPACE_DEBUG = process.env.SAUL_DEBUG_WORKSPACE === '1';

function workspaceDebug(message, payload) {
  if (!WORKSPACE_DEBUG) {
    return;
  }
  if (payload === undefined) {
    console.debug(`[Saul Workspace] ${message}`);
    return;
  }
  console.debug(`[Saul Workspace] ${message}`, payload);
}

class WorkspaceTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.disposables = [];
    this.workspaceSizes = new Map();
    this.SCAN_INTERVAL_MS = 30 * 60 * 1000;
  }

  start() {
    try {
      this.dispose();
      
      // VSCODE-010: Save timer references for cleanup
      // Increased delay to 10s to avoid blocking during startup
      this.initialScanTimer = setTimeout(() => {
        try {
          this.scanWorkspaces();
        } catch (error) {
          console.error('[Saul Workspace] Initial scan error:', error?.message || String(error));
        }
      }, 10000);
      
      this.scanInterval = setInterval(() => {
        try {
          this.scanWorkspaces();
        } catch (error) {
          console.error('[Saul Workspace] Periodic scan error:', error?.message || String(error));
        }
      }, this.SCAN_INTERVAL_MS);

      this.disposables.push(
        vscode.workspace.onDidChangeWorkspaceFolders((event) => {
          try {
            this.trackWorkspaceChange(event);
            this.scanWorkspaces();
          } catch (error) {
            console.error('[Saul Workspace] Workspace change error:', error?.message || String(error));
          }
        })
      );
    } catch (error) {
      console.error('[Saul Workspace] Start failed:', error?.message || String(error));
    }
  }

  dispose() {
    // VSCODE-010: Clear timers
    if (this.scanInterval) {
      clearInterval(this.scanInterval);
      this.scanInterval = null;
    }
    if (this.initialScanTimer) {
      clearTimeout(this.initialScanTimer);
      this.initialScanTimer = null;
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
    this.workspaceSizes.clear();
  }

  async scanWorkspaces() {
    const config = this.getConfig();
    if (!config.enableTracking) {
      workspaceDebug('Tracking disabled');
      return;
    }

    const folders = vscode.workspace.workspaceFolders || [];
    workspaceDebug('Scanning workspace folders', { totalFolders: folders.length });
    
    for (const folder of folders) {
      await this.scanWorkspaceFolder(folder);
    }
  }

  async scanWorkspaceFolder(folder) {
    const config = this.getConfig();
    if (!config.enableTracking) {
      return;
    }

    try {
      const stats = await this.analyzeWorkspace(folder);
      
      const heartbeat = this.buildHeartbeat({
        entityType: 'workspace',
        entity: folder.uri.fsPath,
        project: folder.name,
        category: 'coding',
        isWrite: false,
        metadata: {
          workspaceName: folder.name,
          totalFiles: stats.totalFiles,
          totalDirectories: stats.totalDirectories,
          totalSizeBytes: stats.totalSizeBytes,
          largestFiles: stats.largestFiles.slice(0, 5),
          topExtensions: stats.topExtensions.slice(0, 10)
        }
      });

      this.queue.enqueue(heartbeat);
      this.workspaceSizes.set(folder.uri.fsPath, stats.totalSizeBytes);
    } catch (error) {
      console.error('[Saul Workspace] Failed to scan workspace:', error?.message || String(error));
    }
  }

  async analyzeWorkspace(folder) {
    workspaceDebug('Analyzing workspace folder', { folderName: folder.name });
    
    const stats = {
      totalFiles: 0,
      totalDirectories: 0,
      totalSizeBytes: 0,
      largestFiles: [],
      filesByExtension: {},
      topExtensions: []
    };

    try {
      workspaceDebug('Finding files for workspace analysis');
      
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/*'),
        '**/node_modules/**',
        5000
      );

      workspaceDebug('Found potential files', { files: files.length });

      if (files.length === 0) {
        workspaceDebug('No files found during workspace scan');
        return stats;
      }

      const fileSizes = [];
      let processedCount = 0;

      for (const file of files) {
        try {
          const stat = await vscode.workspace.fs.stat(file);
          
          if (stat.type === vscode.FileType.File) {
            stats.totalFiles++;
            stats.totalSizeBytes += stat.size;
            processedCount++;

            const ext = path.extname(file.fsPath).toLowerCase() || '.none';
            stats.filesByExtension[ext] = (stats.filesByExtension[ext] || 0) + 1;

            fileSizes.push({
              path: vscode.workspace.asRelativePath(file),
              size: stat.size
            });
          }
        } catch (error) {
          workspaceDebug('Skipped one file due to stat error');
        }
      }

      workspaceDebug('Workspace files processed', { processed: processedCount, discovered: files.length });

      stats.largestFiles = fileSizes
        .sort((a, b) => b.size - a.size)
        .slice(0, 10)
        .map((f) => ({
          path: f.path,
          sizeBytes: f.size,
          sizeMB: (f.size / (1024 * 1024)).toFixed(2)
        }));

      stats.topExtensions = Object.entries(stats.filesByExtension)
        .map(([ext, count]) => ({ extension: ext, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const sizeMB = Number((stats.totalSizeBytes / (1024 * 1024)).toFixed(2));
      workspaceDebug('Workspace analysis complete', { totalFiles: stats.totalFiles, totalSizeMB: sizeMB });

    } catch (error) {
      console.error('[Saul Workspace] Failed to analyze workspace:', error?.message || String(error));
    }

    return stats;
  }

  trackWorkspaceChange(event) {
    const config = this.getConfig();
    if (!config.enableTracking) {
      return;
    }

    const added = event.added.map((f) => f.name);
    const removed = event.removed.map((f) => f.name);

    const heartbeat = this.buildHeartbeat({
      entityType: 'workspace_change',
      entity: 'workspace',
      project: getCurrentProjectName(),
      category: 'workspace',
      isWrite: true,
      metadata: {
        eventType: 'workspace_folders_changed',
        foldersAdded: added,
        foldersRemoved: removed,
        totalFolders: (vscode.workspace.workspaceFolders || []).length
      }
    });

    this.queue.enqueue(heartbeat);
  }
}

module.exports = {
  WorkspaceTracker
};
