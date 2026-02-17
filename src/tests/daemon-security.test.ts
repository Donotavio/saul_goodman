/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DAEMON_PATH = path.join(process.cwd(), 'saul-daemon', 'index.cjs');

async function waitForHealth(port: number): Promise<void> {
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`${origin}/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // ignore until ready
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Daemon did not become healthy');
}

test('daemon enforces pairing key and date window', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'saul-daemon-test-'));
  const port = 4123;
  const env = {
    ...process.env,
    PORT: String(port),
    PAIRING_KEY: 'test-key',
    SAUL_DAEMON_DATA_DIR: tmpDir,
    BIND_HOST: '127.0.0.1'
  };
  const child = spawn(process.execPath, [DAEMON_PATH], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await waitForHealth(port);

  const base = `http://127.0.0.1:${port}`;

  // missing key should 401
  const noKeyRes = await fetch(`${base}/v1/tracking/vscode/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sessionId: 'abc', durationMs: 1000 })
  });
  assert.equal(noKeyRes.status, 401);

  // valid heartbeat works
  const okRes = await fetch(`${base}/v1/tracking/vscode/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: 'test-key',
      sessionId: 'abc',
      durationMs: 1000,
      timestamp: Date.now()
    })
  });
  assert.equal(okRes.status, 204);

  // future date rejected
  const future = Date.now() + 3 * 24 * 60 * 60 * 1000;
  const futureRes = await fetch(`${base}/v1/tracking/vscode/heartbeat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      key: 'test-key',
      sessionId: 'def',
      durationMs: 1000,
      timestamp: future
    })
  });
  assert.equal(futureRes.status, 400);

  child.kill('SIGTERM');
  rmSync(tmpDir, { recursive: true, force: true });
});
