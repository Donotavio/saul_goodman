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

const html = readFile('src/popup/popup.html');
const css = readFile('src/popup/popup.css');
const messages = JSON.parse(readFile('_locales/en_US/messages.json'));

function extractRootBlock(src: string): string {
  const match = src.match(/:root\s*\{([^}]+)\}/);
  return match ? match[1] : '';
}

// ── Group 1: HTML Structure ─────────────────────────────────────────────────

test('Popup has header with badge and score elements', () => {
  assert.ok(html.includes('id="scoreValue"'), 'missing #scoreValue');
  assert.ok(html.includes('id="scoreMessage"'), 'missing #scoreMessage');
  assert.ok(html.includes('id="lastSync"'), 'missing #lastSync');
  assert.ok(html.includes('class="badge"'), 'missing .badge');
});

test('Popup has suggestion card with required elements', () => {
  assert.ok(html.includes('id="suggestionCard"'), 'missing #suggestionCard');
  assert.ok(html.includes('id="suggestionDomain"'), 'missing #suggestionDomain');
  assert.ok(html.includes('id="suggestionClassification"'), 'missing #suggestionClassification');
  assert.ok(html.includes('id="suggestionConfidence"'), 'missing #suggestionConfidence');
  assert.ok(html.includes('id="suggestionReasons"'), 'missing #suggestionReasons');

  const actionButtons = [
    'suggestionProductiveButton',
    'suggestionProcrastinationButton',
    'suggestionIgnoreButton',
    'suggestionManualButton',
  ];
  for (const id of actionButtons) {
    assert.ok(html.includes(`id="${id}"`), `missing suggestion action button #${id}`);
  }
});

test('Popup has KPI board with 6 articles', () => {
  const kpiGridMatch = html.match(/class="kpi-grid"[\s\S]*?<\/div>/);
  assert.ok(kpiGridMatch, 'missing .kpi-grid');

  const kpiIds = [
    'focusRateValue',
    'tabSwitchRateValue',
    'inactivePercentValue',
    'productivityRatioValue',
    'topFocusDomain',
    'topProcrastinationDomain',
  ];
  for (const id of kpiIds) {
    assert.ok(html.includes(`id="${id}"`), `missing KPI element #${id}`);
  }
});

test('Popup has fairness card with toggle and context select', () => {
  assert.ok(html.includes('id="fairnessStatus"'), 'missing #fairnessStatus');
  assert.ok(html.includes('id="manualOverrideToggle"'), 'missing #manualOverrideToggle');
  assert.ok(html.includes('id="contextSelect"'), 'missing #contextSelect');

  const contexts = ['work', 'personal', 'leisure', 'study', 'dayOff', 'vacation'];
  for (const ctx of contexts) {
    assert.ok(html.includes(`value="${ctx}"`), `missing context option "${ctx}"`);
  }
});

test('Popup has summary section with time elements', () => {
  assert.ok(html.includes('id="productiveTime"'), 'missing #productiveTime');
  assert.ok(html.includes('id="procrastinationTime"'), 'missing #procrastinationTime');
  assert.ok(html.includes('id="inactiveTime"'), 'missing #inactiveTime');
});

test('Popup has chart and blog card', () => {
  assert.ok(html.includes('id="productivityChart"'), 'missing #productivityChart');
  assert.ok(html.includes('id="blogCard"'), 'missing #blogCard');
  assert.ok(html.includes('id="blogTitle"'), 'missing #blogTitle');
  assert.ok(html.includes('id="blogExcerpt"'), 'missing #blogExcerpt');
  assert.ok(html.includes('id="blogReadButton"'), 'missing #blogReadButton');
});

test('Popup has export card and critical overlay', () => {
  assert.ok(html.includes('id="csvExportButton"'), 'missing #csvExportButton');
  assert.ok(html.includes('id="pdfExportButton"'), 'missing #pdfExportButton');
  assert.ok(html.includes('id="reportButton"'), 'missing #reportButton');
  assert.ok(html.includes('id="criticalOverlay"'), 'missing #criticalOverlay');
  assert.ok(html.includes('id="criticalMessage"'), 'missing #criticalMessage');
  assert.ok(html.includes('id="criticalCountdown"'), 'missing #criticalCountdown');
});

// ── Group 2: i18n Keys ──────────────────────────────────────────────────────

test('All popup data-i18n keys exist in en_US messages', () => {
  const keyPattern = /data-i18n="([^"]+)"/g;
  let match;
  const keys: string[] = [];
  while ((match = keyPattern.exec(html)) !== null) {
    keys.push(match[1]);
  }
  assert.ok(keys.length >= 30, `expected at least 30 data-i18n keys in popup, found ${keys.length}`);

  const missing: string[] = [];
  for (const key of keys) {
    if (!messages[key]) missing.push(key);
  }
  assert.equal(missing.length, 0, `Missing i18n keys in en_US: ${missing.join(', ')}`);
});

test('All popup data-i18n-aria-label keys exist in en_US messages', () => {
  const keyPattern = /data-i18n-aria-label="([^"]+)"/g;
  let match;
  const keys: string[] = [];
  while ((match = keyPattern.exec(html)) !== null) {
    keys.push(match[1]);
  }
  assert.ok(keys.length >= 2, `expected at least 2 aria-label i18n keys, found ${keys.length}`);

  const missing: string[] = [];
  for (const key of keys) {
    if (!messages[key]) missing.push(key);
  }
  assert.equal(missing.length, 0, `Missing aria-label i18n keys: ${missing.join(', ')}`);
});

test('All popup data-i18n-tooltip keys exist in en_US messages', () => {
  const keyPattern = /data-i18n-tooltip="([^"]+)"/g;
  let match;
  const keys: string[] = [];
  while ((match = keyPattern.exec(html)) !== null) {
    keys.push(match[1]);
  }
  assert.ok(keys.length >= 4, `expected at least 4 tooltip i18n keys, found ${keys.length}`);

  const missing: string[] = [];
  for (const key of keys) {
    if (!messages[key]) missing.push(key);
  }
  assert.equal(missing.length, 0, `Missing tooltip i18n keys: ${missing.join(', ')}`);
});

// ── Group 3: CSS Design System ──────────────────────────────────────────────

test('Popup .badge .value follows design system', () => {
  const valueBlock = css.match(/\.badge\s+\.value\s*\{([^}]+)\}/);
  assert.ok(valueBlock, '.badge .value rule not found');
  const rules = valueBlock![1];

  assert.ok(/font-size:\s*1\.5rem/.test(rules), 'expected font-size: 1.5rem on badge value');
  assert.ok(/font-weight:\s*800/.test(rules), 'expected font-weight: 800 on badge value');
});

test('Popup .suggestion-card follows design system card pattern', () => {
  const block = css.match(/\.suggestion-card\s*\{([^}]+)\}/);
  assert.ok(block, '.suggestion-card rule not found');
  const rules = block![1];

  assert.ok(/border:\s*2px\s+dashed/.test(rules), 'expected 2px dashed border on suggestion card');
  assert.ok(/border-radius:\s*10px/.test(rules), 'expected border-radius: 10px');
  assert.ok(/box-shadow:/.test(rules), 'expected box-shadow on suggestion card');
});

test('Popup .kpi-grid article follows design system KPI pattern', () => {
  const block = css.match(/\.kpi-grid\s+article\s*\{([^}]+)\}/);
  assert.ok(block, '.kpi-grid article rule not found');
  const rules = block![1];

  assert.ok(/border:\s*1px\s+solid/.test(rules), 'expected border on KPI articles');
  assert.ok(/border-radius:\s*10px/.test(rules), 'expected border-radius: 10px');
});

test('Popup .kpi-label follows design system label pattern', () => {
  const block = css.match(/\.kpi-label\s*\{([^}]+)\}/);
  assert.ok(block, '.kpi-label rule not found');
  const rules = block![1];

  assert.ok(/text-transform:\s*uppercase/.test(rules), 'expected text-transform: uppercase');
  assert.ok(/letter-spacing:/.test(rules), 'expected letter-spacing on KPI labels');
  assert.ok(/font-size:\s*0\.7rem/.test(rules), 'expected font-size: 0.7rem');
});

test('Popup .critical-card follows design system', () => {
  const block = css.match(/\.critical-card\s*\{([^}]+)\}/);
  assert.ok(block, '.critical-card rule not found');
  const rules = block![1];

  assert.ok(/border:\s*3px\s+solid/.test(rules), 'expected 3px solid border');
  assert.ok(/border-radius:\s*16px/.test(rules), 'expected border-radius: 16px');
  assert.ok(/box-shadow:/.test(rules), 'expected box-shadow on critical card');
});

test('Popup :root defines required design tokens', () => {
  const rootBlock = extractRootBlock(css);
  const required = [
    '--saul-yellow',
    '--saul-gold',
    '--saul-black',
    '--saul-danger',
    '--saul-success',
    '--saul-neutral',
    '--saul-white',
    '--saul-shadow',
  ];
  const missing: string[] = [];
  for (const token of required) {
    if (!rootBlock.includes(token)) missing.push(token);
  }
  assert.equal(missing.length, 0, `Missing tokens in popup :root: ${missing.join(', ')}`);
});
