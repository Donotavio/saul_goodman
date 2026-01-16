const vscode = require('vscode');

function getCurrentProjectName(documentUri = null) {
  const activeEditor = vscode.window.activeTextEditor;
  const uri = documentUri || activeEditor?.document?.uri;
  
  if (uri) {
    const workspaceFolder = vscode.workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      return workspaceFolder.name;
    }
  }
  
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length > 0) {
    return folders[0].name;
  }
  
  return '';
}

module.exports = {
  getCurrentProjectName
};
