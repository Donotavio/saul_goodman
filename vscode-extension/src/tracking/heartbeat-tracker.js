const vscode = require('vscode');
const path = require('path');
const { getOrCreateWorkspaceId } = require('../utils/identity');

const WRITE_THROTTLE_MS = 30 * 1000;
const FOCUS_THROTTLE_MS = 2 * 60 * 1000;

class HeartbeatTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.lastSentByEntity = new Map();
    this.windowFocused = true;
    this.disposables = [];
  }

  start() {
    this.dispose();
    this.disposables.push(
      vscode.window.onDidChangeWindowState((state) => {
        this.windowFocused = state.focused;
      }),
      vscode.window.onDidChangeActiveTextEditor((editor) => {
        if (editor?.document) {
          this.sendDocumentHeartbeat(editor.document, false);
        }
      }),
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.sendDocumentHeartbeat(event.document, true, getLineDelta(event));
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        this.sendDocumentHeartbeat(document, true);
      })
    );
  }

  dispose() {
    this.disposables.forEach((item) => item.dispose());
    this.disposables = [];
  }

  sendDocumentHeartbeat(document, isWrite, delta) {
    const config = this.getConfig();
    if (!config.enableTracking) {
      return;
    }
    if (!this.windowFocused) {
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
    const threshold = isWrite ? WRITE_THROTTLE_MS : FOCUS_THROTTLE_MS;
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

    const heartbeat = this.buildHeartbeat({
      entityType: 'file',
      entity,
      project: projectName,
      language: document.languageId,
      category: 'coding',
      isWrite,
      metadata
    });

    this.queue.enqueue(heartbeat);
  }
}

function resolveEntity(document, workspaceFolder, config) {
  if (config.hashFilePaths !== false) {
    return document.uri.fsPath;
  }
  if (workspaceFolder) {
    const relative = path.relative(workspaceFolder.uri.fsPath, document.uri.fsPath);
    return relative || path.basename(document.uri.fsPath);
  }
  return document.uri.fsPath;
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
