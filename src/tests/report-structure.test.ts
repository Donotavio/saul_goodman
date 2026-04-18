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

const html = readFile('src/report/report.html');
const css = readFile('src/report/report.css');
const messages = JSON.parse(readFile('_locales/en_US/messages.json'));

function extractRootBlock(src: string): string {
  const match = src.match(/:root\s*\{([^}]+)\}/);
  return match ? match[1] : '';
}

// ── Group 1: HTML Structure ─────────────────────────────────────────────────

test('Report has hero section with KPIs', () => {
  const heroIds = ['heroIndex', 'heroFocus', 'heroSwitches', 'heroProductive', 'heroProcrastination', 'heroIdle'];
  for (const id of heroIds) {
    assert.ok(html.includes(`id="${id}"`), `missing hero element #${id}`);
  }
  assert.ok(html.includes('id="reportDate"'), 'missing #reportDate');
  assert.ok(html.includes('id="heroMessage"'), 'missing #heroMessage');
});

test('Report has chart containers', () => {
  const chartIds = ['hourlyChart', 'tabSwitchChart', 'compositionChart', 'domainBreakdownChart'];
  for (const id of chartIds) {
    assert.ok(html.includes(`id="${id}"`), `missing chart container #${id}`);
  }
});

test('Report has VS Code sub-section with charts', () => {
  assert.ok(html.includes('id="vscodeReportSection"'), 'missing #vscodeReportSection');
  const vscodeCharts = ['vscodeHourlyChart', 'vscodeProjectsChart', 'vscodeCommitsChart', 'vscodeCrossReferenceChart'];
  for (const id of vscodeCharts) {
    assert.ok(html.includes(`id="${id}"`), `missing VS Code chart #${id}`);
  }
});

test('Report has VS Code telemetry KPIs', () => {
  assert.ok(html.includes('id="vscodeTelemetrySection"'), 'missing #vscodeTelemetrySection');
  const telIds = ['vscodeTelDebugSessions', 'vscodeTelTestSuccess', 'vscodeTelBuilds', 'vscodeTelPomodoros', 'vscodeTelMaxCombo'];
  for (const id of telIds) {
    assert.ok(html.includes(`id="${id}"`), `missing telemetry KPI #${id}`);
  }
});

test('Report has ML summary section', () => {
  assert.ok(html.includes('id="mlSummarySection"'), 'missing #mlSummarySection');
  const mlIds = ['mlUpdates', 'mlActiveFeatures', 'mlGuardrailStage'];
  for (const id of mlIds) {
    assert.ok(html.includes(`id="${id}"`), `missing ML element #${id}`);
  }
});

test('Report has context breakdown section', () => {
  assert.ok(html.includes('id="contextBreakdownSection"'), 'missing #contextBreakdownSection');
  assert.ok(html.includes('id="contextBreakdownTable"'), 'missing #contextBreakdownTable');
});

test('Report has fairness and critical banners', () => {
  assert.ok(html.includes('id="criticalBanner"'), 'missing #criticalBanner');
  assert.ok(html.includes('id="criticalBannerMessage"'), 'missing #criticalBannerMessage');
  assert.ok(html.includes('id="criticalBannerCountdown"'), 'missing #criticalBannerCountdown');
  assert.ok(html.includes('id="fairnessStatusReport"'), 'missing #fairnessStatusReport');
});

test('Report has export and navigation buttons', () => {
  assert.ok(html.includes('id="pdfReportButton"'), 'missing #pdfReportButton');
  assert.ok(html.includes('id="backButton"'), 'missing #backButton');
  assert.ok(html.includes('id="shareMenuButton"'), 'missing #shareMenuButton');
});

// ── Group 2: i18n Keys ──────────────────────────────────────────────────────

test('All report data-i18n keys exist in en_US messages', () => {
  const keyPattern = /data-i18n="([^"]+)"/g;
  let match;
  const keys: string[] = [];
  while ((match = keyPattern.exec(html)) !== null) {
    keys.push(match[1]);
  }
  assert.ok(keys.length >= 20, `expected at least 20 data-i18n keys in report, found ${keys.length}`);

  const missing: string[] = [];
  for (const key of keys) {
    if (!messages[key]) missing.push(key);
  }
  assert.equal(missing.length, 0, `Missing i18n keys in en_US: ${missing.join(', ')}`);
});

// ── Group 3: CSS Design System ──────────────────────────────────────────────

test('Report .report-hero follows design system header pattern', () => {
  const block = css.match(/\.report-hero\s*\{([^}]+)\}/);
  assert.ok(block, '.report-hero rule not found');
  const rules = block![1];

  assert.ok(/border:\s*3px\s+solid/.test(rules), 'expected 3px solid border on .report-hero');
  assert.ok(/border-radius:\s*20px/.test(rules), 'expected border-radius: 20px');
  assert.ok(/box-shadow:\s*8px\s+8px\s+0/.test(rules), 'expected box-shadow: 8px 8px 0');
});

test('Report .panel follows design system card pattern', () => {
  const block = css.match(/\.panel\s*\{([^}]+)\}/);
  assert.ok(block, '.panel rule not found in report CSS');
  const rules = block![1];

  assert.ok(/border:\s*2px\s+solid/.test(rules), 'expected 2px solid border on .panel');
  assert.ok(/border-radius:\s*16px/.test(rules), 'expected border-radius: 16px');
  assert.ok(/box-shadow:\s*4px\s+4px\s+0/.test(rules), 'expected box-shadow: 4px 4px 0');
});

test('Report .kpi-panel article follows KPI pattern', () => {
  const block = css.match(/\.kpi-panel\s+article\s*\{([^}]+)\}/);
  assert.ok(block, '.kpi-panel article rule not found');
  const rules = block![1];

  assert.ok(/border:\s*1px\s+solid/.test(rules), 'expected 1px solid border on KPI articles');
  assert.ok(/border-radius:\s*12px/.test(rules), 'expected border-radius: 12px');
});

test('Report .vscode-kpi-card follows design system', () => {
  const block = css.match(/\.vscode-kpi-card\s*\{([^}]+)\}/);
  assert.ok(block, '.vscode-kpi-card rule not found');
  const rules = block![1];

  assert.ok(/border:\s*2px\s+solid/.test(rules), 'expected 2px solid border on VS Code KPI cards');
  assert.ok(/border-radius:\s*12px/.test(rules), 'expected border-radius: 12px');
  assert.ok(/box-shadow:\s*3px\s+3px\s+0/.test(rules), 'expected box-shadow: 3px 3px 0');
});

test('Report :root defines required design tokens', () => {
  const rootBlock = extractRootBlock(css);
  const required = [
    '--saul-yellow',
    '--saul-gold',
    '--saul-black',
    '--saul-danger',
    '--saul-success',
    '--saul-bg',
    '--saul-shadow',
    '--saul-neutral',
    '--saul-white',
    '--ctx-work',
    '--ctx-personal',
    '--ctx-leisure',
    '--ctx-study',
  ];
  const missing: string[] = [];
  for (const token of required) {
    if (!rootBlock.includes(token)) missing.push(token);
  }
  assert.equal(missing.length, 0, `Missing tokens in report :root: ${missing.join(', ')}`);
});
