const vscode = require('vscode');
const { anonymizePath, getOrCreateHashSalt } = require('../utils/privacy');
const { getCurrentProjectName } = require('../utils/workspace-helper').default;

class RefactorTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.disposables = [];
  }

  start() {
    try {
      console.log('[Saul Refactor] Refactor tracker started');
      this.dispose();

      const salt = getOrCreateHashSalt(this.context);

      this.disposables.push(
        vscode.workspace.onWillRenameFiles((event) => {
          try {
            const config = this.getConfig();
            if (!config.enableTelemetry) return;

            const count = event.files.length;
            const fileIds = event.files.map(f => anonymizePath(f.oldUri.fsPath, salt));

            const heartbeat = this.buildHeartbeat({
              entityType: 'refactor',
              entity: 'rename_files',
              project: getCurrentProjectName(),
              category: 'refactoring',
              isWrite: false,
              metadata: {
                count,
                fileId: fileIds[0] || 'unknown'
              }
            });

            this.queue.enqueue(heartbeat);
            console.log(`[Saul Refactor] Files renamed: ${count}`);
          } catch (error) {
            console.error('[Saul Refactor] Rename files error:', error);
          }
        }),

        vscode.workspace.onDidRenameFiles((event) => {
          try {
            const config = this.getConfig();
            if (!config.enableTelemetry) return;

            const count = event.files.length;

            const heartbeat = this.buildHeartbeat({
              entityType: 'refactor',
              entity: 'rename_files_complete',
              project: getCurrentProjectName(),
              category: 'refactoring',
              isWrite: false,
              metadata: {
                count
              }
            });

            this.queue.enqueue(heartbeat);
          } catch (error) {
            console.error('[Saul Refactor] Rename complete error:', error);
          }
        })
      );

      const originalApplyEdit = vscode.workspace.applyEdit;
      let applyEditCount = 0;

      vscode.workspace.applyEdit = async (edit, metadata) => {
        try {
          const config = this.getConfig();
          
          if (config.enableTelemetry) {
            const entryCount = edit.entries().length;
            
            if (entryCount > 0) {
              applyEditCount++;

              const heartbeat = this.buildHeartbeat({
                entityType: 'refactor',
                entity: 'apply_edit',
                project: getCurrentProjectName(),
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
        } catch (error) {
          console.error('[Saul Refactor] Apply edit error:', error);
        }

        return originalApplyEdit.call(vscode.workspace, edit, metadata);
      };

      this.disposables.push({
        dispose: () => {
          vscode.workspace.applyEdit = originalApplyEdit;
        }
      });

      if (vscode.languages.registerCodeActionsProvider) {
        // VSCODE-012: Save interval reference for cleanup
        this.codeActionSampler = setInterval(() => {
          try {
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
                    project: getCurrentProjectName(),
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
          } catch (error) {
            console.error('[Saul Refactor] Code action sampler error:', error);
          }
        }, 30000);

        this.disposables.push({
          dispose: () => clearInterval(this.codeActionSampler)
        });
      }
    } catch (error) {
      console.error('[Saul Refactor] Start failed:', error);
    }
  }

  dispose() {
    // VSCODE-012: Clear code action sampler
    if (this.codeActionSampler) {
      clearInterval(this.codeActionSampler);
      this.codeActionSampler = null;
    }
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

module.exports = { RefactorTracker };
