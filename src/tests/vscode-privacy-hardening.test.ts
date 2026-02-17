/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

function readRepoFile(relativePath: string): string {
  return readFileSync(path.join(process.cwd(), relativePath), 'utf8');
}

function extractConsoleLines(source: string): string[] {
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /console\.(log|debug|info|warn|error)\(/.test(line));
}

test('vscode tracking/report logs do not print sensitive path or key fields', () => {
  const targets = [
    'vscode-extension/src/tracking/git-tracker.js',
    'vscode-extension/src/tracking/workspace-tracker.js',
    'vscode-extension/src/reports/report.js'
  ];

  const disallowedPatterns = [
    /\$\{[^}]*pairingKey[^}]*\}/i,
    /\$\{[^}]*(repoPath|filePath|workspacePath)[^}]*\}/i,
    /\b(pairingKey|repoPath|filePath|workspacePath)\b\s*:/i,
    /\bpatch\s*preview\b/i
  ];

  for (const relativePath of targets) {
    const source = readRepoFile(relativePath);
    const consoleLines = extractConsoleLines(source);
    for (const line of consoleLines) {
      for (const pattern of disallowedPatterns) {
        assert.equal(
          pattern.test(line),
          false,
          `${relativePath} has sensitive console output pattern: ${line}`
        );
      }
    }
  }
});

test('vscode report webview uses local chart assets and reduced config injection', () => {
  const html = readRepoFile('vscode-extension/src/reports/report.html');
  const reportView = readRepoFile('vscode-extension/src/reports/report-view.js');

  assert.equal(/cdn\.jsdelivr|unpkg\.com|https:\/\/cdn\./i.test(html), false);
  assert.ok(html.includes('{chartJsUri}'));
  assert.ok(html.includes('{chartAdapterUri}'));
  assert.ok(html.includes("script-src {cspSource} 'nonce-{nonce}'"));

  assert.ok(reportView.includes('function buildReportConfig(config)'));
  assert.ok(reportView.includes(".replace('{config}', JSON.stringify(reportConfig))"));
  assert.equal(
    reportView.includes(".replace('{config}', JSON.stringify(config))"),
    false,
    'Webview must not inject the full extension config object'
  );
});
