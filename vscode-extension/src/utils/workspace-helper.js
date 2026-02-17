const { window, workspace } = require('vscode');

function getCurrentProjectName(documentUri = null) {
  const activeEditor = window.activeTextEditor;
  const uri = documentUri || activeEditor?.document?.uri;
  
  if (uri) {
    const workspaceFolder = workspace.getWorkspaceFolder(uri);
    if (workspaceFolder) {
      return workspaceFolder.name;
    }
  }
  
  const folders = workspace.workspaceFolders || [];
  if (folders.length > 0) {
    return folders[0].name;
  }
  
  return '';
}

module.exports = {
  default: {
    getCurrentProjectName
  },
  getCurrentProjectName
};
