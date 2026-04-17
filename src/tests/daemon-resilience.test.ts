/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DAEMON_PATH = path.join(process.cwd(), 'saul-daemon', 'index.cjs');

async function waitForHealth(port: number): Promise<void> {
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${origin}/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // ignore until ready
    }
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error('Daemon did not become healthy');
}

function spawnDaemon(port: number, tmpDir: string, extraEnv: Record<string, string> = {}): ChildProcess {
  const env = {
    ...process.env,
    PORT: String(port),
    PAIRING_KEY: 'test-key',
    SAUL_DAEMON_DATA_DIR: tmpDir,
    BIND_HOST: '127.0.0.1',
    ...extraEnv
  };
  return spawn(process.execPath, [DAEMON_PATH], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
}

function makeHeartbeat(overrides: Record<string, unknown> = {}) {
  return {
    entity: '/test/file.ts',
    entityType: 'file',
    project: 'test-project',
    language: 'TypeScript',
    time: Date.now(),
    ...overrides
  };
}

test('Fix 1: invalid timestamp heartbeats are rejected', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'saul-daemon-test-'));
  const port = 4200;
  const child = spawnDaemon(port, tmpDir);

  try {
    await waitForHealth(port);
    const base = `http://127.0.0.1:${port}`;

    const res = await fetch(`${base}/v1/vscode/heartbeats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'test-key',
        heartbeats: [
          makeHeartbeat({ time: null }),
          makeHeartbeat({ time: undefined, timestamp: undefined }),
          makeHeartbeat({ time: 'garbage' }),
          makeHeartbeat({ time: {} }),
          makeHeartbeat()
        ]
      })
    });
    assert.equal(res.status, 200);
    const body = await res.json() as { accepted: number; total: number };
    assert.equal(body.accepted, 1, 'Only the valid heartbeat should be accepted');
  } finally {
    child.kill('SIGTERM');
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Fix 4: isDurationRelevant filters via durations endpoint', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'saul-daemon-test-'));
  const port = 4203;
  const child = spawnDaemon(port, tmpDir);

  try {
    await waitForHealth(port);
    const base = `http://127.0.0.1:${port}`;
    const now = Date.now();

    const res = await fetch(`${base}/v1/vscode/heartbeats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'test-key',
        heartbeats: [
          makeHeartbeat({ project: 'unknown', language: 'TypeScript', time: now }),
          makeHeartbeat({ project: 'real-project', language: 'unknown', time: now + 1000 }),
          makeHeartbeat({ project: '', language: 'TypeScript', time: now + 2000 }),
          makeHeartbeat({ project: 'real-project', language: 'TypeScript', time: now + 3000 }),
          makeHeartbeat({ project: 'real-project', language: 'Python', time: now + 60000 })
        ]
      })
    });
    assert.equal(res.status, 200);

    const today = new Date().toISOString().slice(0, 10);
    const durRes = await fetch(
      `${base}/v1/vscode/durations?key=test-key&date=${today}`
    );
    assert.equal(durRes.status, 200);
    const durBody = await durRes.json() as { data: Array<{ project: string; language: string }> };

    for (const dur of durBody.data) {
      assert.ok(dur.project && dur.project.toLowerCase() !== 'unknown',
        `Duration should not have project='${dur.project}'`);
      assert.ok(dur.language && dur.language.toLowerCase() !== 'unknown',
        `Duration should not have language='${dur.language}'`);
    }

    assert.ok(durBody.data.length > 0, 'Should have at least one valid duration');
  } finally {
    child.kill('SIGTERM');
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Fix 5: concurrent batches do not corrupt state', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'saul-daemon-test-'));
  const port = 4204;
  const child = spawnDaemon(port, tmpDir);

  try {
    await waitForHealth(port);
    const base = `http://127.0.0.1:${port}`;
    const now = Date.now();

    const batchA = Array.from({ length: 50 }, (_, i) =>
      makeHeartbeat({ time: now + i * 15000, entity: `/a/file${i}.ts` })
    );
    const batchB = Array.from({ length: 50 }, (_, i) =>
      makeHeartbeat({ time: now + (i + 50) * 15000, entity: `/b/file${i}.ts` })
    );

    const [resA, resB] = await Promise.all([
      fetch(`${base}/v1/vscode/heartbeats`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'test-key', heartbeats: batchA })
      }),
      fetch(`${base}/v1/vscode/heartbeats`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key: 'test-key', heartbeats: batchB })
      })
    ]);

    assert.equal(resA.status, 200);
    assert.equal(resB.status, 200);

    const bodyA = await resA.json() as { accepted: number; total: number };
    const bodyB = await resB.json() as { accepted: number; total: number };

    const totalAccepted = bodyA.accepted + bodyB.accepted;
    assert.equal(totalAccepted, 100, 'All 100 heartbeats should be accepted');

    const finalTotal = Math.max(bodyA.total, bodyB.total);
    assert.equal(finalTotal, 100, 'Final total should be 100');

    const today = new Date().toISOString().slice(0, 10);
    const hbRes = await fetch(
      `${base}/v1/vscode/heartbeats?key=test-key&date=${today}&per_page=200`
    );
    assert.equal(hbRes.status, 200);
    const hbBody = await hbRes.json() as { data: Array<{ id: string }> };
    const ids = new Set(hbBody.data.map((h: { id: string }) => h.id));
    assert.equal(ids.size, 100, 'No duplicate heartbeat IDs');
  } finally {
    child.kill('SIGTERM');
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('Fix 3: corrupted json falls back to .tmp', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'saul-daemon-test-'));
  const port = 4202;

  const dataDir = path.join(tmpDir, 'data');
  mkdirSync(dataDir, { recursive: true });

  const now = Date.now();
  const validState = {
    byKey: {
      'test-key': {
        heartbeats: [
          {
            id: 'recovered-hb-1',
            entity: '/recovered/file.ts',
            entityType: 'file',
            project: 'recovered-project',
            language: 'TypeScript',
            time: now,
            groupKey: 'recovered-project||TypeScript||vscode||',
            metadata: {}
          }
        ],
        durations: [],
        lastUpdated: now
      }
    }
  };

  writeFileSync(
    path.join(dataDir, 'vscode-tracking.json'),
    '{ corrupted json !!!'
  );
  writeFileSync(
    path.join(dataDir, 'vscode-tracking.json.tmp'),
    JSON.stringify(validState)
  );
  writeFileSync(path.join(dataDir, 'vscode-usage.json'), '{}');

  const child = spawnDaemon(port, tmpDir);

  try {
    await waitForHealth(port);
    const base = `http://127.0.0.1:${port}`;

    const today = new Date().toISOString().slice(0, 10);
    const hbRes = await fetch(
      `${base}/v1/vscode/heartbeats?key=test-key&date=${today}&per_page=200`
    );
    assert.equal(hbRes.status, 200);
    const hbBody = await hbRes.json() as { data: Array<{ id: string }> };
    assert.ok(hbBody.data.length > 0, 'Should have recovered heartbeat from .tmp');

    const recovered = hbBody.data.find((h: { id: string }) => h.id === 'recovered-hb-1');
    assert.ok(recovered, 'Should find the specific recovered heartbeat');
  } finally {
    child.kill('SIGTERM');
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
