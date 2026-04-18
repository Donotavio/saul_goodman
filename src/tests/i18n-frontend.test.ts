/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

const HTML_FILES = [
  'src/popup/popup.html',
  'src/options/options.html',
  'src/report/report.html',
  'src/block/block.html',
];

function readFile(relPath: string): string {
  return readFileSync(resolve(root, relPath), 'utf-8');
}

function loadMessages(): Record<string, { message: string }> {
  const raw = readFileSync(resolve(root, '_locales/en_US/messages.json'), 'utf-8');
  return JSON.parse(raw);
}

test('all data-i18n keys in HTML have corresponding entries in en_US messages', () => {
  const messages = loadMessages();
  const keyPattern = /data-i18n="([^"]+)"/g;

  for (const file of HTML_FILES) {
    const html = readFile(file);
    let match;
    const missing: string[] = [];
    while ((match = keyPattern.exec(html)) !== null) {
      const key = match[1];
      if (!messages[key]) missing.push(key);
    }
    assert.equal(missing.length, 0, `${file} references missing i18n keys: ${missing.join(', ')}`);
  }
});

test('all data-i18n-aria-label keys in HTML have corresponding entries in en_US messages', () => {
  const messages = loadMessages();
  const keyPattern = /data-i18n-aria-label="([^"]+)"/g;

  for (const file of HTML_FILES) {
    const html = readFile(file);
    let match;
    const missing: string[] = [];
    while ((match = keyPattern.exec(html)) !== null) {
      const key = match[1];
      if (!messages[key]) missing.push(key);
    }
    assert.equal(missing.length, 0, `${file} references missing i18n aria-label keys: ${missing.join(', ')}`);
  }
});

test('all data-i18n-tooltip keys in HTML have corresponding entries in en_US messages', () => {
  const messages = loadMessages();
  const keyPattern = /data-i18n-tooltip="([^"]+)"/g;

  for (const file of HTML_FILES) {
    const html = readFile(file);
    let match;
    const missing: string[] = [];
    while ((match = keyPattern.exec(html)) !== null) {
      const key = match[1];
      if (!messages[key]) missing.push(key);
    }
    assert.equal(missing.length, 0, `${file} references missing i18n tooltip keys: ${missing.join(', ')}`);
  }
});

test('all data-i18n-alt keys in HTML have corresponding entries in en_US messages', () => {
  const messages = loadMessages();
  const keyPattern = /data-i18n-alt="([^"]+)"/g;

  for (const file of HTML_FILES) {
    const html = readFile(file);
    let match;
    const missing: string[] = [];
    while ((match = keyPattern.exec(html)) !== null) {
      const key = match[1];
      if (!messages[key]) missing.push(key);
    }
    assert.equal(missing.length, 0, `${file} references missing i18n alt keys: ${missing.join(', ')}`);
  }
});
