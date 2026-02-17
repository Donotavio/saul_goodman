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

function buildReportConfig(config) {
  const safe = config && typeof config === 'object' ? config : {};
  return {
    enableReportsInVscode: Boolean(safe.enableReportsInVscode),
    enableTelemetry: Boolean(safe.enableTelemetry),
    apiBase: typeof safe.apiBase === 'string' ? safe.apiBase : '',
    pairingKey: typeof safe.pairingKey === 'string' ? safe.pairingKey : ''
  };
}

function buildHtml(webview, extensionUri, config, i18n) {
  const templatePath = path.join(extensionUri.fsPath, 'src', 'reports', 'report.html');
  const cssPath = path.join(extensionUri.fsPath, 'src', 'reports', 'report.css');
  const logoPath = path.join(extensionUri.fsPath, 'images', 'logotipo_saul_goodman.png');
  
  let template = fs.readFileSync(templatePath, 'utf8');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  const logoBase64 = fs.readFileSync(logoPath).toString('base64');
  
  const nonce = getNonce();
  const scriptUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'src', 'reports', 'report.js')
  );
  const reportHourlyUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'src', 'reports', 'report-hourly.js')
  );
  const comboTimelineUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'src', 'reports', 'combo-timeline-chart.js')
  );
  const commitsDistributionUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'src', 'reports', 'commit-distribution.js')
  );
  const chartJsUri = webview.asWebviewUri(
    vscode.Uri.joinPath(extensionUri, 'src', 'reports', 'vendor', 'chart.umd.js')
  );
  const chartAdapterUri = webview.asWebviewUri(
    vscode.Uri.joinPath(
      extensionUri,
      'src',
      'reports',
      'vendor',
      'chartjs-adapter-date-fns.bundle.min.js'
    )
  );

  const inlineStyles = `<style nonce="${nonce}">${cssContent}</style>`;
  const logoDataUri = `data:image/png;base64,${logoBase64}`;
  const reportConfig = buildReportConfig(config);

  // Replace all i18n placeholders in the template
  template = template.replace(/{i18n_([a-zA-Z0-9_]+)}/g, (match, key) => {
    return i18n[key] || key;
  });

  return template
    .replace(/{nonce}/g, nonce)
    .replace('{cspSource}', webview.cspSource)
    .replace('{scriptUri}', scriptUri.toString())
    .replace('{reportHourlyUri}', reportHourlyUri.toString())
    .replace('{comboTimelineUri}', comboTimelineUri.toString())
    .replace('{commitsDistributionUri}', commitsDistributionUri.toString())
    .replace('{chartJsUri}', chartJsUri.toString())
    .replace('{chartAdapterUri}', chartAdapterUri.toString())
    .replace('<link rel="stylesheet" href="{styleUri}" />', inlineStyles)
    .replace('{logoUri}', logoDataUri)
    .replace('{config}', JSON.stringify(reportConfig))
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
