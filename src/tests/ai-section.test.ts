/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

function readFile(relPath: string): string {
  return readFileSync(resolve(root, relPath), 'utf-8');
}

const chromeHtml = readFile('src/report/report.html');
const chromeCss = readFile('src/report/report.css');
const vscodeHtml = readFile('vscode-extension/src/reports/report.html');
const vscodeCss = readFile('vscode-extension/src/reports/report.css');
const vscodeJs = readFile('vscode-extension/src/reports/report.js');
const chromeMessages = JSON.parse(readFile('_locales/en_US/messages.json'));
const vscodeMessagesEn = JSON.parse(readFile('vscode-extension/_locales/en_US/messages.json'));
const vscodeMessagesPt = JSON.parse(readFile('vscode-extension/_locales/pt_BR/messages.json'));

function extractRootBlock(css: string): string {
  const match = css.match(/:root\s*\{([^}]+)\}/);
  return match ? match[1] : '';
}

// ── Group 1: HTML Structure ─────────────────────────────────────────────────

test('Chrome report has AI section with required elements', () => {
  assert.ok(chromeHtml.includes('id="vscodeAiSection"'), 'missing #vscodeAiSection');
  assert.ok(chromeHtml.includes('vscode-ai-kpi-grid'), 'missing .vscode-ai-kpi-grid');
  assert.ok(chromeHtml.includes('id="chromeAiContributionChart"'), 'missing #chromeAiContributionChart');
  assert.ok(chromeHtml.includes('id="chromeAiToolsList"'), 'missing #chromeAiToolsList');

  const kpiCount = (chromeHtml.match(/class="vscode-ai-kpi"/g) || []).length;
  assert.ok(kpiCount >= 4, `expected at least 4 .vscode-ai-kpi elements, found ${kpiCount}`);
});

test('VS Code report has AI section with required elements', () => {
  assert.ok(vscodeHtml.includes('id="aiActivitySection"'), 'missing #aiActivitySection');
  assert.ok(vscodeHtml.includes('id="aiContributionChart"'), 'missing #aiContributionChart');
  assert.ok(vscodeHtml.includes('id="aiToolsList"'), 'missing #aiToolsList');

  const kpiCount = (vscodeHtml.match(/kpi-card--ai/g) || []).length;
  assert.ok(kpiCount >= 4, `expected at least 4 .kpi-card--ai elements, found ${kpiCount}`);
});

test('Chrome AI KPIs have expected IDs', () => {
  const requiredIds = ['chromeAiLinesAdded', 'chromeHumanLinesAdded', 'chromeInlineCompletions', 'chromeAiTerminalCmds'];
  for (const id of requiredIds) {
    assert.ok(chromeHtml.includes(`id="${id}"`), `missing element #${id} in Chrome report`);
  }
});

test('VS Code AI KPIs have expected IDs', () => {
  const requiredIds = ['aiLinesAdded', 'humanLinesAdded', 'aiInlineCompletions', 'aiTerminalCommands'];
  for (const id of requiredIds) {
    assert.ok(vscodeHtml.includes(`id="${id}"`), `missing element #${id} in VS Code report`);
  }
});

// ── Group 2: CSS Design System Compliance ───────────────────────────────────

test('Chrome .vscode-ai-kpi follows design system card pattern', () => {
  const kpiBlock = chromeCss.match(/\.vscode-ai-kpi\s*\{([^}]+)\}/);
  assert.ok(kpiBlock, '.vscode-ai-kpi rule not found in Chrome CSS');
  const rules = kpiBlock![1];

  assert.ok(/border:\s*2px\s+solid/.test(rules), 'expected 2px solid border on AI KPI cards');
  assert.ok(/box-shadow:/.test(rules), 'expected box-shadow on AI KPI cards');
  assert.ok(/border-radius:\s*14px/.test(rules), 'expected border-radius: 14px on AI KPI cards');
  assert.ok(/background:\s*var\(--saul-white\)/.test(rules), 'expected background: var(--saul-white) on AI KPI cards');
});

test('Chrome .vscode-ai-kpi-label follows design system label pattern', () => {
  const labelBlock = chromeCss.match(/\.vscode-ai-kpi-label\s*\{([^}]+)\}/);
  assert.ok(labelBlock, '.vscode-ai-kpi-label rule not found in Chrome CSS');
  const rules = labelBlock![1];

  assert.ok(/text-transform:\s*uppercase/.test(rules), 'expected text-transform: uppercase on AI KPI labels');
  assert.ok(/letter-spacing:/.test(rules), 'expected letter-spacing on AI KPI labels');
  assert.ok(/font-size:\s*0\.7rem/.test(rules), 'expected font-size: 0.7rem on AI KPI labels');
});

test('Chrome .vscode-ai-tool-item follows badge pattern', () => {
  const toolBlock = chromeCss.match(/\.vscode-ai-tool-item\s*\{([^}]+)\}/);
  assert.ok(toolBlock, '.vscode-ai-tool-item rule not found in Chrome CSS');
  const rules = toolBlock![1];

  assert.ok(/border-radius:\s*999px/.test(rules), 'expected pill border-radius on AI tool items');
  assert.ok(/text-transform:\s*uppercase/.test(rules), 'expected uppercase on AI tool items');
  assert.ok(/font-weight:\s*700/.test(rules), 'expected font-weight: 700 on AI tool items');
});

test('VS Code .kpi-card--ai uses solid token, not rgba', () => {
  const kpiBlock = vscodeCss.match(/\.kpi-card--ai\s*\{([^}]+)\}/);
  assert.ok(kpiBlock, '.kpi-card--ai rule not found in VS Code CSS');
  const rules = kpiBlock![1];

  assert.ok(/border-color:\s*var\(--saul-ai-purple\)/.test(rules), 'expected border-color: var(--saul-ai-purple)');
  assert.ok(!/rgba\(139/.test(rules), 'should not use semi-transparent rgba for AI card border');
});

test('Chrome report.css defines --saul-ai-kpi-shadow in :root', () => {
  const rootBlock = extractRootBlock(chromeCss);
  assert.ok(rootBlock.includes('--saul-ai-kpi-shadow'), 'missing --saul-ai-kpi-shadow in Chrome :root');
});

test('VS Code report.css defines AI chart tokens in :root', () => {
  const rootBlock = extractRootBlock(vscodeCss);
  const required = ['--saul-chart-ai-coding', '--saul-chart-ai-other', '--saul-ai-kpi-shadow'];
  for (const token of required) {
    assert.ok(rootBlock.includes(token), `missing ${token} in VS Code :root`);
  }
});

// ── Group 3: i18n Keys ──────────────────────────────────────────────────────

test('Chrome AI section data-i18n keys exist in en_US messages', () => {
  const aiSectionMatch = chromeHtml.match(/id="vscodeAiSection"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  assert.ok(aiSectionMatch, 'could not extract AI section from Chrome HTML');
  const aiSection = aiSectionMatch![0];

  const keyPattern = /data-i18n="([^"]+)"/g;
  let match;
  const keys: string[] = [];
  while ((match = keyPattern.exec(aiSection)) !== null) {
    keys.push(match[1]);
  }
  assert.ok(keys.length >= 4, `expected at least 4 data-i18n keys in Chrome AI section, found ${keys.length}`);

  for (const key of keys) {
    assert.ok(chromeMessages[key], `Chrome i18n key "${key}" missing from en_US/messages.json`);
  }
});

test('VS Code AI section i18n placeholders exist in en_US messages', () => {
  const requiredKeys = [
    'report_ai_activity_title',
    'report_ai_activity_subtitle',
    'report_ai_contribution_chart',
    'report_ai_tools_active',
    'report_ai_lines_by_ai',
    'report_ai_lines_by_you',
    'report_ai_completions',
    'report_ai_terminal_cmds'
  ];
  for (const key of requiredKeys) {
    assert.ok(vscodeMessagesEn[key], `VS Code i18n key "${key}" missing from en_US/messages.json`);
  }
});

test('VS Code report.js has no hardcoded English strings in AI render', () => {
  const aiBlock = vscodeJs.match(/function renderAiActivity[\s\S]*?(?=\n\s*function\s|\n\s*\/\/\s*={3,}|\Z)/);
  assert.ok(aiBlock, 'renderAiActivity function not found in report.js');
  const fn = aiBlock![0];

  const rawEdits = fn.match(/\+\s*['"] edits['"]/g) || [];
  assert.equal(rawEdits.length, 0, 'found hardcoded " edits" string in renderAiActivity');

  const rawLines = fn.match(/\+\s*['"] lines \(['"]/g) || [];
  assert.equal(rawLines.length, 0, 'found hardcoded " lines (" string in renderAiActivity');
});

test('VS Code i18n keys for AI section also use i18n.report_ai_edits_count and report_ai_chart_tooltip', () => {
  assert.ok(vscodeMessagesEn['report_ai_edits_count'], 'missing report_ai_edits_count in en_US');
  assert.ok(vscodeMessagesEn['report_ai_chart_tooltip'], 'missing report_ai_chart_tooltip in en_US');
});

test('VS Code pt_BR has translated AI keys (not identical to en_US)', () => {
  const keysToCheck = [
    'report_ai_activity_title',
    'report_ai_activity_subtitle',
    'report_ai_edits_count',
    'report_ai_chart_tooltip'
  ];
  for (const key of keysToCheck) {
    const en = vscodeMessagesEn[key]?.message;
    const pt = vscodeMessagesPt[key]?.message;
    assert.ok(pt, `VS Code pt_BR missing key "${key}"`);
    assert.notEqual(en, pt, `VS Code pt_BR key "${key}" is identical to en_US — not translated`);
  }
});

// ── Group 4: Data flow integrity (static analysis) ─────────────────────────

test('VS Code renderAiActivity references all expected element IDs', () => {
  const aiBlock = vscodeJs.match(/function renderAiActivity[\s\S]*?(?=\n\s*function\s|\n\s*\/\/\s*={3,}|\Z)/);
  assert.ok(aiBlock, 'renderAiActivity function not found in report.js');
  const fn = aiBlock![0];

  const expectedIds = ['aiLinesAdded', 'humanLinesAdded', 'aiInlineCompletions', 'aiTerminalCommands', 'aiContributionChart', 'aiToolsList'];
  for (const id of expectedIds) {
    assert.ok(fn.includes(`'${id}'`), `renderAiActivity does not reference element #${id}`);
  }
});

test('VS Code renderAiActivity uses cssVar for chart colors', () => {
  const aiBlock = vscodeJs.match(/function renderAiActivity[\s\S]*?(?=\n\s*function\s|\n\s*\/\/\s*={3,}|\Z)/);
  assert.ok(aiBlock, 'renderAiActivity function not found');
  const fn = aiBlock![0];

  assert.ok(fn.includes("cssVar('--saul-ai-purple')"), 'AI chart should use cssVar for purple');
  assert.ok(fn.includes("cssVar('--saul-emerald')"), 'AI chart should use cssVar for emerald');

  const hexColors = fn.match(/'#[0-9a-fA-F]{3,8}'/g) || [];
  assert.equal(hexColors.length, 0, `renderAiActivity has ${hexColors.length} hardcoded hex color(s): ${hexColors.join(', ')}`);
});

test('VS Code renderAiActivity hides section when all data is zero', () => {
  const aiBlock = vscodeJs.match(/function renderAiActivity[\s\S]*?(?=\n\s*function\s|\n\s*\/\/\s*={3,}|\Z)/);
  assert.ok(aiBlock, 'renderAiActivity function not found');
  const fn = aiBlock![0];

  assert.ok(
    /aiLines\s*===\s*0\s*&&/.test(fn) || /=== 0 &&/.test(fn),
    'renderAiActivity should check for zero data before rendering'
  );
  assert.ok(fn.includes("classList.remove('hidden')"), 'renderAiActivity should remove hidden class when data exists');
});
