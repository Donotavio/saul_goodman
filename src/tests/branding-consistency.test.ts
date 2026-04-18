/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');

const CSS_FILES = [
  'src/popup/popup.css',
  'src/options/options.css',
  'src/report/report.css',
  'src/block/block.css',
  'vscode-extension/src/reports/report.css',
  'vscode-extension/src/ui/combo-toast.css',
];

function readCss(relPath: string): string {
  return readFileSync(resolve(root, relPath), 'utf-8');
}

function extractRootBlock(css: string): string {
  const match = css.match(/:root\s*\{([^}]+)\}/);
  return match ? match[1] : '';
}

function linesOutsideRoot(css: string): string[] {
  let inRoot = false;
  let braceDepth = 0;
  const outside: string[] = [];
  for (const line of css.split('\n')) {
    if (/:root\s*\{/.test(line)) { inRoot = true; braceDepth = 0; }
    if (inRoot) {
      braceDepth += (line.match(/\{/g) || []).length;
      braceDepth -= (line.match(/\}/g) || []).length;
      if (braceDepth <= 0) inRoot = false;
      continue;
    }
    outside.push(line);
  }
  return outside;
}

const HEX_PATTERN = /#(?:[0-9a-fA-F]{3,8})\b/g;

test('zero hardcoded hex outside :root in all CSS files', () => {
  for (const file of CSS_FILES) {
    const css = readCss(file);
    const outside = linesOutsideRoot(css);
    const violations: string[] = [];
    outside.forEach((line, i) => {
      if (/^\s*\/[/*]/.test(line)) return;
      const matches = line.match(HEX_PATTERN);
      if (matches) violations.push(`${file} (outside :root): "${line.trim()}" contains ${matches.join(', ')}`);
    });
    assert.equal(violations.length, 0, `Hardcoded hex found:\n${violations.join('\n')}`);
  }
});

test('every CSS file has a :root block', () => {
  for (const file of CSS_FILES) {
    const css = readCss(file);
    assert.ok(/:root\s*\{/.test(css), `${file} is missing :root block`);
  }
});

test('font-family declared at most once per CSS file', () => {
  for (const file of CSS_FILES) {
    const css = readCss(file);
    const fontDecls = css.match(/font-family\s*:/g) || [];
    assert.ok(fontDecls.length <= 1, `${file} has ${fontDecls.length} font-family declarations (expected <= 1)`);
  }
});

const REQUIRED_TOKENS_CHROME = [
  '--saul-yellow', '--saul-gold', '--saul-black', '--saul-text',
  '--saul-danger', '--saul-success', '--saul-neutral', '--saul-white',
];

test('Chrome CSS files include required branding tokens', () => {
  const chromeFiles = CSS_FILES.filter(f => f.startsWith('src/'));
  for (const file of chromeFiles) {
    const rootBlock = extractRootBlock(readCss(file));
    for (const token of REQUIRED_TOKENS_CHROME) {
      if (file.includes('block')) continue;
      assert.ok(rootBlock.includes(token), `${file} is missing required token ${token} in :root`);
    }
  }
});

test('block.css uses block-specific tokens', () => {
  const rootBlock = extractRootBlock(readCss('src/block/block.css'));
  const blockTokens = ['--block-bg', '--block-card-bg', '--block-accent', '--block-text-muted'];
  for (const token of blockTokens) {
    assert.ok(rootBlock.includes(token), `block.css is missing required token ${token}`);
  }
});
