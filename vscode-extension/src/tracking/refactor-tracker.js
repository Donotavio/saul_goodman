const vscode = require('vscode');
const { anonymizePath, getOrCreateHashSalt } = require('../utils/privacy');

class RefactorTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.disposables = [];
  }

  start() {
    console.log('[Saul Refactor] Refactor tracker started');
    this.dispose();

    const salt = getOrCreateHashSalt(this.context);

    this.disposables.push(
      vscode.workspace.onWillRenameFiles((event) => {
        const config = this.getConfig();
        if (!config.enableTelemetry) return;

        const count = event.files.length;
        const fileIds = event.files.map(f => anonymizePath(f.oldUri.fsPath, salt));

        const heartbeat = this.buildHeartbeat({
          entityType: 'refactor',
          entity: 'rename_files',
          category: 'refactoring',
          isWrite: false,
          metadata: {
            count,
            fileId: fileIds[0] || 'unknown'
          }
        });

        this.queue.enqueue(heartbeat);
        console.log(`[Saul Refactor] Files renamed: ${count}`);
      }),

      vscode.workspace.onDidRenameFiles((event) => {
        const config = this.getConfig();
        if (!config.enableTelemetry) return;

        const count = event.files.length;

        const heartbeat = this.buildHeartbeat({
          entityType: 'refactor',
          entity: 'rename_files_complete',
          category: 'refactoring',
          isWrite: false,
          metadata: {
            count
          }
        });

        this.queue.enqueue(heartbeat);
      })
    );

    const originalApplyEdit = vscode.workspace.applyEdit;
    let applyEditCount = 0;

    vscode.workspace.applyEdit = async (edit, metadata) => {
      const config = this.getConfig();
      
      if (config.enableTelemetry) {
        const entryCount = edit.entries().length;
        
        if (entryCount > 0) {
          applyEditCount++;

          const heartbeat = this.buildHeartbeat({
            entityType: 'refactor',
            entity: 'apply_edit',
            category: 'refactoring',
            isWrite: false,
            metadata: {
              entryCount,
              label: metadata?.label || 'unknown'
            }
          });

          this.queue.enqueue(heartbeat);
          console.log(`[Saul Refactor] Edit applied: ${entryCount} entries`);
        }
      }

      return originalApplyEdit.call(vscode.workspace, edit, metadata);
    };

    this.disposables.push({
      dispose: () => {
        vscode.workspace.applyEdit = originalApplyEdit;
      }
    });

    if (vscode.languages.registerCodeActionsProvider) {
      const codeActionSampler = setInterval(() => {
        const config = this.getConfig();
        if (!config.enableTelemetry) return;

        const editor = vscode.window.activeTextEditor;
        if (!editor || !editor.document) return;

        const position = editor.selection.active;
        const range = new vscode.Range(position, position);

        vscode.commands.executeCommand('vscode.executeCodeActionProvider', 
          editor.document.uri, 
          range
        ).then((actions) => {
          if (actions && actions.length > 0) {
            const refactorActions = actions.filter(a => 
              a.kind?.value?.includes('refactor')
            );

            if (refactorActions.length > 0) {
              const fileId = anonymizePath(editor.document.uri.fsPath, salt);

              const heartbeat = this.buildHeartbeat({
                entityType: 'refactor',
                entity: 'code_action_available',
                category: 'refactoring',
                isWrite: false,
                metadata: {
                  fileId,
                  count: refactorActions.length
                }
              });

              this.queue.enqueue(heartbeat);
            }
          }
        }).catch(() => {});
      }, 30000);

      this.disposables.push({
        dispose: () => clearInterval(codeActionSampler)
      });
    }
  }

  dispose() {
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

module.exports = { RefactorTracker };
