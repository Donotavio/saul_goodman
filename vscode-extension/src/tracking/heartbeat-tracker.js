const vscode = require('vscode');
const path = require('path');
const { getOrCreateWorkspaceId } = require('../utils/identity');

const DEFAULT_WRITE_THROTTLE_MS = 30 * 1000;
const DEFAULT_FOCUS_THROTTLE_MS = 2 * 60 * 1000;

class HeartbeatTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.lastSentByEntity = new Map();
    this.MAX_CACHE_SIZE = 500; // VSCODE-003: Limit cache size
    this.windowFocused = true;
    this.isIdle = false;
    this.lastActivityTime = Date.now();
    this.idleCheckTimer = null;
    this.disposables = [];
  }

  start() {
    try {
      this.dispose();
      this.startIdleDetection();
      this.disposables.push(
        vscode.window.onDidChangeWindowState((state) => {
          try {
            this.windowFocused = state.focused;
            if (state.focused) {
              this.resetIdleTimer();
            }
          } catch (error) {
            console.error('[Saul Heartbeat] Window state error:', error);
          }
        }),
        vscode.window.onDidChangeActiveTextEditor((editor) => {
          try {
            if (editor?.document) {
              this.resetIdleTimer();
              this.sendDocumentHeartbeat(editor.document, false);
            }
          } catch (error) {
            console.error('[Saul Heartbeat] Active editor error:', error);
          }
        }),
        vscode.workspace.onDidChangeTextDocument((event) => {
          try {
            this.resetIdleTimer();
            this.sendDocumentHeartbeat(event.document, true, getLineDelta(event));
          } catch (error) {
            console.error('[Saul Heartbeat] Text change error:', error);
          }
        }),
        vscode.workspace.onDidSaveTextDocument((document) => {
          try {
            this.resetIdleTimer();
            this.sendDocumentHeartbeat(document, true);
          } catch (error) {
            console.error('[Saul Heartbeat] Save document error:', error);
          }
        })
      );
    } catch (error) {
      console.error('[Saul Heartbeat] Start failed:', error);
    }
  }

  dispose() {
    this.stopIdleDetection();
    this.disposables.forEach((item) => item.dispose());
    this.disposables = [];
  }

  startIdleDetection() {
    this.stopIdleDetection();
    const config = this.getConfig();
    const idleThresholdMs = config.idleThresholdMs || 60000;
    
    this.idleCheckTimer = setInterval(() => {
      const now = Date.now();
      const timeSinceActivity = now - this.lastActivityTime;
      
      if (!this.isIdle && timeSinceActivity >= idleThresholdMs) {
        this.isIdle = true;
        console.log('[Saul Heartbeat] Idle state detected after', Math.round(timeSinceActivity / 1000), 'seconds');
      }
    }, 5000);
  }

  stopIdleDetection() {
    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
      this.idleCheckTimer = null;
    }
  }

  resetIdleTimer() {
    this.lastActivityTime = Date.now();
    if (this.isIdle) {
      this.isIdle = false;
      console.log('[Saul Heartbeat] Activity detected, exiting idle state');
    }
  }

  sendDocumentHeartbeat(document, isWrite = false, delta = null) {
    void this.queueHeartbeat(document, isWrite, delta);
  }

  async queueHeartbeat(document, isWrite = false, delta = null) {
    const config = this.getConfig();
    if (!config.enableTracking) {
      return;
    }
    if (!this.windowFocused) {
      return;
    }
    if (this.isIdle) {
      return;
    }
    if (!document || document.isUntitled) {
      return;
    }
    const now = Date.now();
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(document.uri);
    const projectName = workspaceFolder?.name || '';
    const entity = resolveEntity(document, workspaceFolder, config);
    const lastRecord = this.lastSentByEntity.get(entity) || { writeAt: 0, focusAt: 0 };
    
    // Use configured heartbeatIntervalMs or defaults
    const configuredInterval = config.heartbeatIntervalMs || 15000;
    const writeThrottle = Math.min(configuredInterval * 2, DEFAULT_WRITE_THROTTLE_MS);
    const focusThrottle = Math.max(configuredInterval * 8, DEFAULT_FOCUS_THROTTLE_MS);
    
    const threshold = isWrite ? writeThrottle : focusThrottle;
    const lastTime = isWrite ? lastRecord.writeAt : lastRecord.focusAt;
    if (now - lastTime < threshold) {
      return;
    }
    if (isWrite) {
      lastRecord.writeAt = now;
    } else {
      lastRecord.focusAt = now;
    }
    this.lastSentByEntity.set(entity, lastRecord);

    // VSCODE-003: Prune cache if too large
    if (this.lastSentByEntity.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.lastSentByEntity.entries());
      // Remove oldest 25%
      const toRemove = entries
        .sort((a, b) => {
          const aTime = Math.max(a[1].writeAt, a[1].focusAt);
          const bTime = Math.max(b[1].writeAt, b[1].focusAt);
          return aTime - bTime;
        })
        .slice(0, Math.floor(this.MAX_CACHE_SIZE * 0.25));
      
      toRemove.forEach(([key]) => this.lastSentByEntity.delete(key));
      console.log(`[Saul Heartbeat] Pruned ${toRemove.length} old cache entries`);
    }

    const workspaceId = getOrCreateWorkspaceId(this.context, workspaceFolder?.uri.fsPath);
    const metadata = {
      windowFocused: this.windowFocused,
      workspaceId: workspaceId || undefined
    };
    if (delta) {
      if (Number.isFinite(delta.linesAdded)) {
        metadata.linesAdded = delta.linesAdded;
      }
      if (Number.isFinite(delta.linesRemoved)) {
        metadata.linesRemoved = delta.linesRemoved;
      }
    }

    const branch = await this.getCurrentBranch(document.uri);
    if (branch) {
      metadata.branch = branch;
    }

    const language = normalizeLanguageId(document.languageId);
    const heartbeat = this.buildHeartbeat({
      entityType: 'file',
      entity,
      project: projectName,
      language,
      category: 'coding',
      isWrite,
      metadata
    });

    this.queue.enqueue(heartbeat);
  }

  async getCurrentBranch(fileUri) {
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) {
        return null;
      }

      if (!gitExtension.isActive) {
        await gitExtension.activate();
      }

      const git = gitExtension.exports.getAPI(1);
      const repo = git.getRepository(fileUri);
      
      if (repo && repo.state && repo.state.HEAD) {
        return repo.state.HEAD.name || null;
      }
    } catch (error) {
      return null;
    }
    return null;
  }
}

function resolveEntity(document, workspaceFolder, config) {
  if (config.hashFilePaths === false) {
    if (workspaceFolder) {
      const relative = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);
      return relative || path.basename(document.uri.fsPath);
    }
    return path.basename(document.uri.fsPath);
  }
  return document.uri.fsPath;
}

function normalizeLanguageId(languageId) {
  if (!languageId || typeof languageId !== 'string') {
    return '';
  }
  const normalized = languageId.trim().toLowerCase();
  if (normalized === 'plaintext' || normalized === 'unknown' || normalized === '') {
    return '';
  }
  return normalized;
}

function getLineDelta(event) {
  let linesAdded = 0;
  let linesRemoved = 0;
  for (const change of event.contentChanges) {
    const added = change.text.split(/\r\n|\r|\n/).length - 1;
    const removed = change.range.end.line - change.range.start.line;
    if (added > 0) {
      linesAdded += added;
    }
    if (removed > 0) {
      linesRemoved += removed;
    }
  }
  return { linesAdded, linesRemoved };
}

module.exports = {
  HeartbeatTracker
};
