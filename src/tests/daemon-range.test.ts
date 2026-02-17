/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DAEMON_PATH = path.join(process.cwd(), 'saul-daemon', 'index.cjs');

function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function buildLocalTimestamp(dateKey: string, hour: number): number {
  const [year, month, day] = dateKey.split('-').map((value) => Number(value));
  return new Date(year, month - 1, day, hour, 0, 0, 0).getTime();
}

async function waitForHealth(port: number): Promise<void> {
  const origin = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 40; i += 1) {
    try {
      const res = await fetch(`${origin}/health`);
      if (res.ok) {
        return;
      }
    } catch {
      // wait and retry
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Daemon did not become healthy');
}

test('daemon /v1/vscode/summaries respects start/end range', async () => {
  const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'saul-daemon-range-'));
  const port = 4300 + Math.floor(Math.random() * 800);
  const env = {
    ...process.env,
    PORT: String(port),
    PAIRING_KEY: 'range-test-key',
    SAUL_DAEMON_DATA_DIR: tmpDir,
    SAUL_DAEMON_VSCODE_RETENTION_DAYS: '7',
    BIND_HOST: '127.0.0.1'
  };
  const child = spawn(process.execPath, [DAEMON_PATH], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  const cleanup = () => {
    child.kill('SIGTERM');
    rmSync(tmpDir, { recursive: true, force: true });
  };

  try {
    await waitForHealth(port);
    const base = `http://127.0.0.1:${port}`;
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const todayKey = formatDateKey(today);
    const yesterdayKey = formatDateKey(yesterday);

    const heartbeatRes = await fetch(`${base}/v1/vscode/heartbeats`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        key: 'range-test-key',
        heartbeats: [
          {
            id: `hb-${yesterdayKey}`,
            time: buildLocalTimestamp(yesterdayKey, 10),
            project: 'range-repo',
            language: 'javascript',
            entityType: 'file',
            entity: 'range.js',
            category: 'coding',
            machineId: 'range-machine'
          },
          {
            id: `hb-${todayKey}`,
            time: buildLocalTimestamp(todayKey, 11),
            project: 'range-repo',
            language: 'javascript',
            entityType: 'file',
            entity: 'range.js',
            category: 'coding',
            machineId: 'range-machine'
          }
        ]
      })
    });
    assert.equal(heartbeatRes.status, 200);

    const yesterdayOnlyRes = await fetch(
      `${base}/v1/vscode/summaries?start=${encodeURIComponent(yesterdayKey)}&end=${encodeURIComponent(
        yesterdayKey
      )}&key=range-test-key`
    );
    assert.equal(yesterdayOnlyRes.status, 200);
    const yesterdayOnly = (await yesterdayOnlyRes.json()) as {
      range: { start: string; end: string };
      data: { total_seconds: number; days: Array<{ date: string; total_seconds: number }> };
    };
    assert.equal(yesterdayOnly.range.start, yesterdayKey);
    assert.equal(yesterdayOnly.range.end, yesterdayKey);
    assert.equal(yesterdayOnly.data.days.length, 1);
    assert.equal(yesterdayOnly.data.days[0]?.date, yesterdayKey);
    assert.ok(yesterdayOnly.data.total_seconds > 0);

    const todayOnlyRes = await fetch(
      `${base}/v1/vscode/summaries?start=${encodeURIComponent(todayKey)}&end=${encodeURIComponent(
        todayKey
      )}&key=range-test-key`
    );
    assert.equal(todayOnlyRes.status, 200);
    const todayOnly = (await todayOnlyRes.json()) as {
      range: { start: string; end: string };
      data: { total_seconds: number; days: Array<{ date: string; total_seconds: number }> };
    };
    assert.equal(todayOnly.range.start, todayKey);
    assert.equal(todayOnly.range.end, todayKey);
    assert.equal(todayOnly.data.days.length, 1);
    assert.equal(todayOnly.data.days[0]?.date, todayKey);
    assert.ok(todayOnly.data.total_seconds > 0);

    const twoDaysRes = await fetch(
      `${base}/v1/vscode/summaries?start=${encodeURIComponent(
        yesterdayKey
      )}&end=${encodeURIComponent(todayKey)}&key=range-test-key`
    );
    assert.equal(twoDaysRes.status, 200);
    const twoDays = (await twoDaysRes.json()) as {
      range: { start: string; end: string };
      data: { total_seconds: number; days: Array<{ date: string; total_seconds: number }> };
    };
    assert.equal(twoDays.range.start, yesterdayKey);
    assert.equal(twoDays.range.end, todayKey);
    assert.equal(twoDays.data.days.length, 2);
    assert.deepEqual(
      twoDays.data.days.map((item) => item.date).sort(),
      [todayKey, yesterdayKey].sort()
    );
    const expectedSum = twoDays.data.days.reduce((acc, item) => acc + item.total_seconds, 0);
    assert.equal(twoDays.data.total_seconds, expectedSum);

    const invalidOrderRes = await fetch(
      `${base}/v1/vscode/summaries?start=${encodeURIComponent(todayKey)}&end=${encodeURIComponent(
        yesterdayKey
      )}&key=range-test-key`
    );
    assert.equal(invalidOrderRes.status, 400);

    const invalidDateRes = await fetch(
      `${base}/v1/vscode/summaries?start=2026-13-01&end=${encodeURIComponent(
        todayKey
      )}&key=range-test-key`
    );
    assert.equal(invalidDateRes.status, 400);
  } finally {
    cleanup();
  }
});
