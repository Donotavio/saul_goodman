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

const html = readFile('vscode-extension/src/reports/report.html');
const css = readFile('vscode-extension/src/reports/report.css');
const js = readFile('vscode-extension/src/reports/report.js');
const messagesEn = JSON.parse(readFile('vscode-extension/_locales/en_US/messages.json'));

function extractRootBlock(src: string): string {
  const match = src.match(/:root\s*\{([^}]+)\}/);
  return match ? match[1] : '';
}

// ── Group 1: HTML Structure ─────────────────────────────────────────────────

test('VS Code report has filter controls', () => {
  const ids = ['filterProject', 'filterLanguage', 'filterMachine', 'applyFilters', 'resetFilters'];
  for (const id of ids) {
    assert.ok(html.includes(`id="${id}"`), `missing filter element #${id}`);
  }
});

test('VS Code report has today card and KPIs', () => {
  assert.ok(html.includes('id="statToday"'), 'missing #statToday');
  const kpiIds = ['kpiFocus', 'kpiSwitches', 'kpiProductive', 'kpiProcrast', 'kpiInactive'];
  for (const id of kpiIds) {
    assert.ok(html.includes(`id="${id}"`), `missing KPI element #${id}`);
  }
});

test('VS Code report has data lists', () => {
  const listIds = ['projectsList', 'languagesList', 'summariesList', 'branchesList', 'activityList'];
  for (const id of listIds) {
    assert.ok(html.includes(`id="${id}"`), `missing list element #${id}`);
  }
});

test('VS Code report has chart containers', () => {
  const chartIds = ['hourlyChart', 'projectsChart', 'commitsChart', 'crossReferenceChart'];
  for (const id of chartIds) {
    assert.ok(html.includes(`id="${id}"`), `missing chart container #${id}`);
  }
});

test('VS Code report has telemetry section', () => {
  assert.ok(html.includes('id="telemetrySection"'), 'missing #telemetrySection');
  const telIds = ['telDebugSessions', 'telTestSuccess', 'telBuilds', 'telPomodoros', 'telMaxCombo'];
  for (const id of telIds) {
    assert.ok(html.includes(`id="${id}"`), `missing telemetry element #${id}`);
  }
});

test('VS Code report has disabled state', () => {
  assert.ok(html.includes('id="reportsDisabled"'), 'missing #reportsDisabled');
});

// ── Group 2: i18n Keys ──────────────────────────────────────────────────────

test('VS Code report i18n placeholders exist in en_US messages', () => {
  const keyPattern = /\{i18n_([^}]+)\}/g;
  let match;
  const keys: string[] = [];
  while ((match = keyPattern.exec(html)) !== null) {
    keys.push(match[1]);
  }
  assert.ok(keys.length >= 30, `expected at least 30 i18n placeholders, found ${keys.length}`);

  const missing: string[] = [];
  for (const key of keys) {
    if (!messagesEn[key]) missing.push(key);
  }
  assert.equal(missing.length, 0, `Missing VS Code i18n keys: ${missing.join(', ')}`);
});

test('VS Code telemetry i18n keys exist in en_US messages', () => {
  const telKeys = [
    'report_vscode_telemetry_title',
    'report_vscode_telemetry_subtitle',
    'report_vscode_tel_debug_sessions',
    'report_vscode_tel_test_rate',
    'report_vscode_tel_builds',
    'report_vscode_tel_pomodoros',
    'report_vscode_tel_combo',
  ];
  const missing: string[] = [];
  for (const key of telKeys) {
    if (!messagesEn[key]) missing.push(key);
  }
  assert.equal(missing.length, 0, `Missing telemetry i18n keys: ${missing.join(', ')}`);
});

// ── Group 3: CSS Design System ──────────────────────────────────────────────

test('VS Code .kpi-card follows design system', () => {
  const block = css.match(/\.kpi-card\s*\{([^}]+)\}/);
  assert.ok(block, '.kpi-card rule not found in VS Code CSS');
  const rules = block![1];

  assert.ok(/border:\s*2px\s+solid/.test(rules), 'expected 2px solid border on .kpi-card');
  assert.ok(/border-radius:\s*12px/.test(rules), 'expected border-radius: 12px');
  assert.ok(/box-shadow:\s*3px\s+3px\s+0/.test(rules), 'expected box-shadow: 3px 3px 0');
});

test('VS Code .card follows design system', () => {
  const block = css.match(/\.card\s*\{([^}]+)\}/);
  assert.ok(block, '.card rule not found in VS Code CSS');
  const rules = block![1];

  assert.ok(/border:\s*2px\s+solid/.test(rules), 'expected 2px solid border on .card');
  assert.ok(/border-radius:\s*14px/.test(rules), 'expected border-radius: 14px');
  assert.ok(/box-shadow:\s*4px\s+4px\s+0/.test(rules), 'expected box-shadow: 4px 4px 0');
});

test('VS Code .kpi-card--telemetry uses gradient and border', () => {
  const block = css.match(/\.kpi-card--telemetry\s*\{([^}]+)\}/);
  assert.ok(block, '.kpi-card--telemetry rule not found');
  const rules = block![1];

  assert.ok(/background:\s*linear-gradient/.test(rules), 'expected gradient background on telemetry card');
  assert.ok(/border:\s*2px\s+solid/.test(rules), 'expected 2px solid border on telemetry card');
});

test('VS Code :root defines required design tokens', () => {
  const rootBlock = extractRootBlock(css);
  const required = [
    '--saul-yellow',
    '--saul-gold',
    '--saul-black',
    '--saul-danger',
    '--saul-success',
    '--saul-ai-purple',
    '--saul-shadow',
  ];
  const missing: string[] = [];
  for (const token of required) {
    if (!rootBlock.includes(token)) missing.push(token);
  }
  assert.equal(missing.length, 0, `Missing tokens in VS Code :root: ${missing.join(', ')}`);
});

// ── Group 4: JS Data flow integrity ─────────────────────────────────────────

test('renderKpis references all expected element IDs', () => {
  const block = js.match(/function renderKpis[\s\S]*?(?=\n\s*\n\s*function\s)/);
  assert.ok(block, 'renderKpis function not found');
  const fn = block![0];

  const expectedIds = ['kpiFocus', 'kpiSwitches', 'kpiProductive', 'kpiProcrast', 'kpiInactive'];
  for (const id of expectedIds) {
    assert.ok(fn.includes(`'${id}'`), `renderKpis does not reference #${id}`);
  }
});

test('renderTelemetry references all expected element IDs', () => {
  const block = js.match(/function renderTelemetry[\s\S]*?(?=\n\s*function\s)/);
  assert.ok(block, 'renderTelemetry function not found');
  const fn = block![0];

  const expectedIds = ['telemetrySection', 'telDebugSessions', 'telTestSuccess', 'telBuilds', 'telPomodoros', 'telMaxCombo'];
  for (const id of expectedIds) {
    assert.ok(fn.includes(`'${id}'`), `renderTelemetry does not reference #${id}`);
  }
});

test('Chart instances stored on window for proper destruction', () => {
  const chartInstances = ['projectsChartInstance', 'commitsChartInstance', 'crossReferenceChartInstance'];
  for (const name of chartInstances) {
    assert.ok(js.includes(`window.${name}`), `missing window.${name} for chart lifecycle`);
  }
});

test('formatSeconds and formatDurationMs utility functions exist', () => {
  assert.ok(js.includes('function formatSeconds'), 'missing formatSeconds function');
  assert.ok(js.includes('function formatDurationMs'), 'missing formatDurationMs function');
});

test('renderProjectsChart uses cssVar for colors, not in language color map', () => {
  const block = js.match(/function renderProjectsChart[\s\S]*?(?=\n\s*function\s)/);
  assert.ok(block, 'renderProjectsChart function not found');
  const fn = block![0];

  assert.ok(fn.includes("cssVar("), 'renderProjectsChart should use cssVar for chart colors');
});
