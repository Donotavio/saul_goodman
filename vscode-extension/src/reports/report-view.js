const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

let activePanel = null;

function showReports(context, getConfig, getI18n) {
  if (activePanel) {
    activePanel.reveal(vscode.ViewColumn.Active);
    activePanel.webview.html = buildHtml(activePanel.webview, context.extensionUri, getConfig(), getI18n());
    return;
  }

  const panel = vscode.window.createWebviewPanel(
    'saulGoodmanReports',
    'Saul Goodman: Reports',
    vscode.ViewColumn.Active,
    {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'src', 'reports')]
    }
  );

  panel.webview.html = buildHtml(panel.webview, context.extensionUri, getConfig(), getI18n());
  panel.onDidDispose(() => {
    activePanel = null;
  });

  activePanel = panel;
}

function buildHtml(webview, extensionUri, config, i18n) {
  const templatePath = path.join(extensionUri.fsPath, 'src', 'reports', 'report.html');
  const template = fs.readFileSync(templatePath, 'utf8');
  const nonce = getNonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'src', 'reports', 'report.js')
  );
  const styleUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'src', 'reports', 'report.css')
  );

  return template
    .replace(/{nonce}/g, nonce)
    .replace('{cspSource}', webview.cspSource)
    .replace('{scriptUri}', scriptUri.toString())
    .replace('{styleUri}', styleUri.toString())
    .replace('{config}', JSON.stringify(config))
    .replace('{i18n}', JSON.stringify(i18n || {}));
}

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 16; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

module.exports = {
  showReports
};
