/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DAEMON_PATH = path.join(process.cwd(), 'vscode-extension', 'daemon', 'index.cjs');

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

test('health endpoint never exposes key validation oracle', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'saul-daemon-test-'));
  const port = 4124;
  const env = {
    ...process.env,
    PORT: String(port),
    PAIRING_KEY: 'health-test-key',
    SAUL_DAEMON_DATA_DIR: tmpDir,
    BIND_HOST: '127.0.0.1'
  };
  const child = spawn(process.execPath, [DAEMON_PATH], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await waitForHealth(port);

  const base = `http://127.0.0.1:${port}`;

  // /health without key returns ok (version field is allowed but stable)
  const noKeyRes = await fetch(`${base}/health`);
  assert.equal(noKeyRes.status, 200);
  const noKeyBody = await noKeyRes.json();
  assert.equal(noKeyBody.ok, true);

  // /health with correct key returns identical response — no authenticated field
  const goodKeyRes = await fetch(`${base}/health?key=health-test-key`);
  assert.equal(goodKeyRes.status, 200);
  const goodKeyBody = await goodKeyRes.json();
  assert.deepEqual(goodKeyBody, noKeyBody);

  // /health with wrong key returns identical response — no oracle
  const badKeyRes = await fetch(`${base}/health?key=wrong-key`);
  assert.equal(badKeyRes.status, 200);
  const badKeyBody = await badKeyRes.json();
  assert.deepEqual(badKeyBody, noKeyBody);

  // /v1/health behaves identically
  const v1Res = await fetch(`${base}/v1/health?key=health-test-key`);
  assert.equal(v1Res.status, 200);
  const v1Body = await v1Res.json();
  assert.deepEqual(v1Body, noKeyBody);

  child.kill('SIGTERM');
  rmSync(tmpDir, { recursive: true, force: true });
});

test('CORS rejects vscode-webview with non-UUID host', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'saul-daemon-test-'));
  const port = 4125;
  const env = {
    ...process.env,
    PORT: String(port),
    PAIRING_KEY: 'cors-test-key',
    SAUL_DAEMON_DATA_DIR: tmpDir,
    BIND_HOST: '127.0.0.1'
  };
  const child = spawn(process.execPath, [DAEMON_PATH], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await waitForHealth(port);

  const base = `http://127.0.0.1:${port}`;

  const maliciousRes = await fetch(`${base}/health`, {
    headers: { origin: 'vscode-webview://malicious.example.com' }
  });
  assert.equal(maliciousRes.status, 200);
  assert.equal(maliciousRes.headers.get('access-control-allow-origin'), null);

  const validRes = await fetch(`${base}/health`, {
    headers: { origin: 'vscode-webview://abc123-def456-7890' }
  });
  assert.equal(validRes.status, 200);
  assert.equal(validRes.headers.get('access-control-allow-origin'), 'vscode-webview://abc123-def456-7890');

  const chromeRes = await fetch(`${base}/health`, {
    headers: { origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop' }
  });
  assert.equal(chromeRes.status, 200);
  assert.equal(
    chromeRes.headers.get('access-control-allow-origin'),
    'chrome-extension://abcdefghijklmnopabcdefghijklmnop'
  );

  child.kill('SIGTERM');
  rmSync(tmpDir, { recursive: true, force: true });
});

test('almost-correct pairing key is rejected', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'saul-daemon-test-'));
  const port = 4126;
  const env = {
    ...process.env,
    PORT: String(port),
    PAIRING_KEY: 'my-secret-key-123',
    SAUL_DAEMON_DATA_DIR: tmpDir,
    BIND_HOST: '127.0.0.1'
  };
  const child = spawn(process.execPath, [DAEMON_PATH], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await waitForHealth(port);

  const base = `http://127.0.0.1:${port}`;

  const almostRight = await fetch(
    `${base}/v1/tracking/vscode/summary?key=my-secret-key-124&date=2026-04-18`
  );
  assert.equal(almostRight.status, 401);

  const prefixMatch = await fetch(
    `${base}/v1/tracking/vscode/summary?key=my-secret-key-12&date=2026-04-18`
  );
  assert.equal(prefixMatch.status, 401);

  const correctKey = await fetch(
    `${base}/v1/tracking/vscode/summary?key=my-secret-key-123&date=2026-04-18`
  );
  assert.equal(correctKey.status, 200);

  child.kill('SIGTERM');
  rmSync(tmpDir, { recursive: true, force: true });
});
