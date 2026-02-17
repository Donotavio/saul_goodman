/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

test('vscode extension package exposes required activation event and command', () => {
  const pkgPath = path.join(process.cwd(), 'vscode-extension', 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8')) as {
    activationEvents?: string[];
    contributes?: { commands?: Array<{ command?: string }> };
  };

  assert.ok(Array.isArray(pkg.activationEvents));
  assert.ok(pkg.activationEvents?.includes('onCommand:saulGoodman.startDaemon'));

  const commands = pkg.contributes?.commands?.map((item) => item.command) ?? [];
  assert.ok(commands.includes('saulGoodman.startDaemon'));
});
