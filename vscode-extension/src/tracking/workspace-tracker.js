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
    
    setTimeout(() => {
      this.scanWorkspaces();
    }, 5000);
    
    const interval = setInterval(() => {
      this.scanWorkspaces();
    }, this.SCAN_INTERVAL_MS);

    this.disposables.push({
      dispose: () => clearInterval(interval)
    });

    this.disposables.push(
      vscode.workspace.onDidChangeWorkspaceFolders((event) => {
        this.trackWorkspaceChange(event);
        this.scanWorkspaces();
      })
    );
  }

  dispose() {
    this.disposables.forEach((item) => item.dispose());
    this.disposables = [];
    this.workspaceSizes.clear();
  }

  async scanWorkspaces() {
    const config = this.getConfig();
    if (!config.enableTracking) {
      return;
    }

    const folders = vscode.workspace.workspaceFolders || [];
    
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
        category: 'workspace',
        isWrite: false,
        metadata: {
          eventType: 'workspace_scan',
          workspaceName: folder.name,
          workspacePath: folder.uri.fsPath,
          workspaceIndex: folder.index,
          totalFiles: stats.totalFiles,
          totalDirectories: stats.totalDirectories,
          totalSizeBytes: stats.totalSizeBytes,
          largestFiles: stats.largestFiles,
          filesByExtension: stats.filesByExtension,
          topExtensions: stats.topExtensions
        }
      });

      this.queue.enqueue(heartbeat);
      this.workspaceSizes.set(folder.uri.fsPath, stats.totalSizeBytes);
    } catch (error) {
      console.error('[Saul Workspace] Failed to scan workspace:', error);
    }
  }

  async analyzeWorkspace(folder) {
    const stats = {
      totalFiles: 0,
      totalDirectories: 0,
      totalSizeBytes: 0,
      largestFiles: [],
      filesByExtension: {},
      topExtensions: []
    };

    const excludePatterns = [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
      '**/.vscode/**',
      '**/out/**',
      '**/.next/**',
      '**/__pycache__/**',
      '**/.pytest_cache/**'
    ];

    try {
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/*'),
        `{${excludePatterns.join(',')}}`,
        10000
      );

      const fileSizes = [];

      for (const file of files) {
        try {
          const stat = await vscode.workspace.fs.stat(file);
          
          if (stat.type === vscode.FileType.File) {
            stats.totalFiles++;
            stats.totalSizeBytes += stat.size;

            const ext = path.extname(file.fsPath).toLowerCase() || 'no-extension';
            stats.filesByExtension[ext] = (stats.filesByExtension[ext] || 0) + 1;

            fileSizes.push({
              path: vscode.workspace.asRelativePath(file),
              size: stat.size
            });
          }
        } catch (error) {
          // Ignore files that can't be stat'd
        }
      }

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

    } catch (error) {
      console.error('[Saul Workspace] Failed to analyze workspace:', error);
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
