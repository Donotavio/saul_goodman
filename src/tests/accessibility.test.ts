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

const CSS_FILES = [
  'src/popup/popup.css',
  'src/options/options.css',
  'src/report/report.css',
  'src/block/block.css',
  'vscode-extension/src/reports/report.css',
];

function readFile(relPath: string): string {
  return readFileSync(resolve(root, relPath), 'utf-8');
}

test('all HTML files have lang attribute', () => {
  for (const file of HTML_FILES) {
    const html = readFile(file);
    assert.ok(/<html[^>]+lang=/.test(html), `${file} is missing lang attribute on <html>`);
  }
});

test('all img tags have alt or data-i18n-alt', () => {
  for (const file of HTML_FILES) {
    const html = readFile(file);
    const imgTags = html.match(/<img[^>]*>/g) || [];
    for (const img of imgTags) {
      const hasAlt = /alt=/.test(img) || /data-i18n-alt=/.test(img);
      assert.ok(hasAlt, `${file} has <img> without alt: ${img.slice(0, 80)}`);
    }
  }
});

test('all info-icons have role and tabindex attributes', () => {
  for (const file of HTML_FILES) {
    const html = readFile(file);
    const infoIconRegex = /class="info-icon"[\s\S]*?>/g;
    let match;
    while ((match = infoIconRegex.exec(html)) !== null) {
      const tag = match[0];
      assert.ok(/role=/.test(tag), `${file} info-icon missing role: ${tag.slice(0, 60)}`);
      assert.ok(/tabindex=/.test(tag), `${file} info-icon missing tabindex: ${tag.slice(0, 60)}`);
    }
  }
});

test('no outline:none without focus indicator substitute in CSS', () => {
  for (const file of CSS_FILES) {
    const css = readFile(file);
    const lines = css.split('\n');
    lines.forEach((line, i) => {
      if (/outline\s*:\s*none/.test(line)) {
        const context = lines.slice(Math.max(0, i - 3), i + 4).join('\n');
        const hasFocusRing = /box-shadow|border-color|outline.*solid/.test(context);
        assert.ok(hasFocusRing, `${file}:${i + 1} has outline:none without visible focus substitute`);
      }
    });
  }
});

test('all CSS files have :focus-visible rule', () => {
  for (const file of CSS_FILES) {
    const css = readFile(file);
    assert.ok(/:focus-visible/.test(css), `${file} is missing :focus-visible rule`);
  }
});

test('all CSS files have prefers-reduced-motion media query', () => {
  for (const file of CSS_FILES) {
    const css = readFile(file);
    assert.ok(/prefers-reduced-motion/.test(css), `${file} is missing @media (prefers-reduced-motion) rule`);
  }
});
