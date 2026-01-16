const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

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
    this.dispose();
    
    // VSCODE-010: Save timer references for cleanup
    this.initialScanTimer = setTimeout(() => {
      this.scanWorkspaces();
    }, 5000);
    
    this.scanInterval = setInterval(() => {
      this.scanWorkspaces();
    }, this.SCAN_INTERVAL_MS);

    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        this.trackWorkspaceChange(event);
        this.scanWorkspaces();
      })
    );
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
      console.log('[Saul Workspace] Tracking disabled');
      return;
    }

    const folders = vscode.workspace.workspaceFolders || [];
    console.log('[Saul Workspace] Scanning', folders.length, 'workspace folders');
    
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
      console.error('[Saul Workspace] Failed to scan workspace:', error);
    }
  }

  async analyzeWorkspace(folder) {
    console.log('[Saul Workspace] Analyzing folder:', folder.name, folder.uri.fsPath);
    
    const stats = {
      totalFiles: 0,
      totalDirectories: 0,
      totalSizeBytes: 0,
      largestFiles: [],
      filesByExtension: {},
      topExtensions: []
    };

    try {
      console.log('[Saul Workspace] Finding files in:', folder.uri.fsPath);
      
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/*'),
        '**/node_modules/**',
        5000
      );

      console.log('[Saul Workspace] Found', files.length, 'potential files');

      if (files.length === 0) {
        console.warn('[Saul Workspace] No files found - workspace might be empty or all excluded');
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
          console.log('[Saul Workspace] Skipped file (stat failed):', file.fsPath);
        }
      }

      console.log('[Saul Workspace] Processed', processedCount, 'of', files.length, 'files');

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

      const sizeMB = (stats.totalSizeBytes / (1024 * 1024)).toFixed(2);
      console.log('[Saul Workspace] ✓ Analysis complete:', stats.totalFiles, 'files,', sizeMB, 'MB');

    } catch (error) {
      console.error('[Saul Workspace] ✗ Failed to analyze workspace:', error);
      console.error('[Saul Workspace] Error stack:', error.stack);
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
