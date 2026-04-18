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

const html = readFile('src/options/options.html');
const css = readFile('src/options/options.css');
const messages = JSON.parse(readFile('_locales/en_US/messages.json'));

function extractRootBlock(src: string): string {
  const match = src.match(/:root\s*\{([^}]+)\}/);
  return match ? match[1] : '';
}

// ── Group 1: HTML Structure ─────────────────────────────────────────────────

test('Options has weight inputs with correct types', () => {
  const weightIds = ['procrastinationWeight', 'tabSwitchWeight', 'inactivityWeight'];
  for (const id of weightIds) {
    assert.ok(html.includes(`id="${id}"`), `missing weight input #${id}`);
  }
  assert.ok(html.includes('id="inactivityThreshold"'), 'missing #inactivityThreshold');
});

test('Options has domain management panels', () => {
  const ids = [
    'productiveList',
    'procrastinationList',
    'productiveInput',
    'procrastinationInput',
    'productiveForm',
    'procrastinationForm',
    'domainFilterInput',
  ];
  for (const id of ids) {
    assert.ok(html.includes(`id="${id}"`), `missing domain element #${id}`);
  }
});

test('Options has VS Code integration panel', () => {
  const ids = [
    'vscodeIntegrationEnabled',
    'vscodeLocalApiUrl',
    'vscodePairingKey',
    'testVscodeConnection',
    'generateVscodeKey',
    'copyVscodeKey',
  ];
  for (const id of ids) {
    assert.ok(html.includes(`id="${id}"`), `missing VS Code element #${id}`);
  }
});

test('Options has schedule and critical mode panels', () => {
  assert.ok(html.includes('id="workScheduleList"'), 'missing #workScheduleList');
  assert.ok(html.includes('id="addWorkIntervalButton"'), 'missing #addWorkIntervalButton');
  assert.ok(html.includes('id="criticalThreshold"'), 'missing #criticalThreshold');
  assert.ok(html.includes('id="criticalSoundEnabled"'), 'missing #criticalSoundEnabled');
});

test('Options has ML review queue', () => {
  assert.ok(html.includes('id="mlReviewQueueList"'), 'missing #mlReviewQueueList');
  assert.ok(html.includes('id="mlReviewQueueEmpty"'), 'missing #mlReviewQueueEmpty');
  assert.ok(html.includes('id="enableAutoClassification"'), 'missing #enableAutoClassification');
});

test('Options has locale selector and action buttons', () => {
  assert.ok(html.includes('id="localeSelect"'), 'missing #localeSelect');
  assert.ok(html.includes('id="statusMessage"'), 'missing #statusMessage');
  assert.ok(html.includes('id="resetButton"'), 'missing #resetButton');
  assert.ok(html.includes('id="backToPopupButton"'), 'missing #backToPopupButton');
});

// ── Group 2: i18n Keys ──────────────────────────────────────────────────────

test('All options data-i18n keys exist in en_US messages', () => {
  const keyPattern = /data-i18n="([^"]+)"/g;
  let match;
  const keys: string[] = [];
  while ((match = keyPattern.exec(html)) !== null) {
    keys.push(match[1]);
  }
  assert.ok(keys.length >= 40, `expected at least 40 data-i18n keys in options, found ${keys.length}`);

  const missing: string[] = [];
  for (const key of keys) {
    if (!messages[key]) missing.push(key);
  }
  assert.equal(missing.length, 0, `Missing i18n keys in en_US: ${missing.join(', ')}`);
});

test('All options data-i18n-placeholder keys exist in en_US messages', () => {
  const keyPattern = /data-i18n-placeholder="([^"]+)"/g;
  let match;
  const keys: string[] = [];
  while ((match = keyPattern.exec(html)) !== null) {
    keys.push(match[1]);
  }
  assert.ok(keys.length >= 3, `expected at least 3 placeholder i18n keys, found ${keys.length}`);

  const missing: string[] = [];
  for (const key of keys) {
    if (!messages[key]) missing.push(key);
  }
  assert.equal(missing.length, 0, `Missing placeholder i18n keys: ${missing.join(', ')}`);
});

// ── Group 3: CSS Design System ──────────────────────────────────────────────

test('Options .panel follows design system card pattern', () => {
  const block = css.match(/\.panel\s*\{([^}]+)\}/);
  assert.ok(block, '.panel rule not found in options CSS');
  const rules = block![1];

  assert.ok(/border:\s*2px\s+solid/.test(rules), 'expected 2px solid border on .panel');
  assert.ok(/border-radius:\s*12px/.test(rules), 'expected border-radius: 12px');
  assert.ok(/box-shadow:/.test(rules), 'expected box-shadow on .panel');
});

test('Options .hero follows design system header pattern', () => {
  const block = css.match(/\.hero\s*\{([^}]+)\}/);
  assert.ok(block, '.hero rule not found in options CSS');
  const rules = block![1];

  assert.ok(/border:\s*3px\s+solid/.test(rules), 'expected 3px solid border on .hero');
  assert.ok(/border-radius:\s*18px/.test(rules), 'expected border-radius: 18px');
  assert.ok(/box-shadow:/.test(rules), 'expected box-shadow on .hero');
});

test('Options :root defines required design tokens', () => {
  const rootBlock = extractRootBlock(css);
  const required = [
    '--saul-yellow',
    '--saul-gold',
    '--saul-black',
    '--saul-danger',
    '--saul-success',
    '--saul-bg',
    '--saul-shadow',
  ];
  const missing: string[] = [];
  for (const token of required) {
    if (!rootBlock.includes(token)) missing.push(token);
  }
  assert.equal(missing.length, 0, `Missing tokens in options :root: ${missing.join(', ')}`);
});
