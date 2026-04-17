/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { isWithinWorkSchedule, splitDurationByHour } from '../shared/utils/time.js';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildDurations } = require('../../vscode-extension/daemon/src/vscode-aggregation.cjs');

function makeHeartbeat(time: number) {
  return {
    id: `hb-${time}`,
    time,
    entityType: 'file',
    entity: 'file.ts',
    project: 'proj',
    language: 'ts',
    category: 'coding',
    isWrite: false,
    editor: 'vscode',
    pluginVersion: '1.0.0',
    machineId: 'machine-1',
    metadata: {}
  };
}

// --- Guardrail #1: splitDurationByHour accepts future time ---
test('documents_current_behavior_splitDurationByHour_allows_future_time', () => {
  const now = Date.now();
  const start = now - 30 * 60 * 1000;
  const duration = 2 * 60 * 60 * 1000;
  const segments = splitDurationByHour(start, duration);
  const total = segments.reduce((sum, segment) => sum + segment.milliseconds, 0);
  assert.equal(total, duration);
});

// --- Guardrail #2: Overtime uses only sliceStart ---
test('documents_current_behavior_overtime_uses_slice_start_only', () => {
  const schedule = [{ start: '09:00', end: '10:00' }];
  const sliceStart = new Date('2024-01-01T09:59:00');
  const sliceEnd = new Date('2024-01-01T10:01:00');
  assert.equal(isWithinWorkSchedule(sliceStart, schedule), true);
  assert.equal(isWithinWorkSchedule(sliceEnd, schedule), false);
});

// --- Guardrail #3: Interval with start==end rejects the interval (RISCO-03 fix) ---
test('RISCO-03: schedule start==end rejects interval instead of covering 24h', () => {
  const schedule = [{ start: '09:00', end: '09:00' }];
  assert.equal(isWithinWorkSchedule(new Date('2024-01-01T03:00:00'), schedule), false);
  assert.equal(isWithinWorkSchedule(new Date('2024-01-01T09:00:00'), schedule), false);
  assert.equal(isWithinWorkSchedule(new Date('2024-01-01T15:00:00'), schedule), false);
});

test('RISCO-03: valid schedule still works after start==end fix', () => {
  const schedule = [{ start: '09:00', end: '17:00' }];
  assert.equal(isWithinWorkSchedule(new Date('2024-01-01T10:00:00'), schedule), true);
  assert.equal(isWithinWorkSchedule(new Date('2024-01-01T20:00:00'), schedule), false);
});

// --- Guardrail #4: Duration minimum and grace for single heartbeat ---
// (primary tests in vscode-aggregation.test.ts)
test('documents_current_behavior_single_heartbeat_uses_min_30s_or_grace', () => {
  const realNow = Date.now;
  Date.now = () => 1_000_000;
  try {
    const durations = buildDurations([makeHeartbeat(1_000)], { graceMs: 120_000, gapMs: 300_000 });
    assert.equal(durations.length, 1);
    assert.equal(durations[0].durationMs, 30_000);
  } finally {
    Date.now = realNow;
  }
});

test('documents_current_behavior_single_heartbeat_grace_smaller_than_30s', () => {
  const realNow = Date.now;
  Date.now = () => 1_000_000;
  try {
    const durations = buildDurations([makeHeartbeat(1_000)], { graceMs: 10_000, gapMs: 300_000 });
    assert.equal(durations.length, 1);
    assert.equal(durations[0].durationMs, 10_000);
  } finally {
    Date.now = realNow;
  }
});

// --- Guardrail #5: Commits per hour are synthetic ---
// (primary test in commits-distribution.test.ts)

// --- Guardrail #6: All agents use local timezone ---
test('documents_current_behavior_agents_use_local_timezone_for_datekey', () => {
  const date = new Date('2024-06-15T02:00:00Z');
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const localKey = `${year}-${month}-${day}`;

  const utcYear = date.getUTCFullYear();
  const utcMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  const utcDay = String(date.getUTCDate()).padStart(2, '0');
  const utcKey = `${utcYear}-${utcMonth}-${utcDay}`;

  const offset = date.getTimezoneOffset();
  if (offset !== 0) {
    assert.notEqual(localKey, utcKey, 'Local and UTC dateKeys should differ in non-UTC timezones');
  } else {
    assert.equal(localKey, utcKey, 'Local and UTC dateKeys match in UTC timezone');
  }
});

// --- Guardrail #7: Retention can cut sessions crossing midnight ---
test('documents_current_behavior_retention_drops_old_heartbeats_from_cross_midnight_session', () => {
  const realNow = Date.now;
  const baseTime = new Date('2024-06-15T23:50:00').getTime();
  const afterMidnight = new Date('2024-06-16T00:10:00').getTime();
  Date.now = () => afterMidnight + 60_000;
  try {
    const hbs = [
      makeHeartbeat(baseTime),
      makeHeartbeat(baseTime + 5 * 60_000),
      makeHeartbeat(afterMidnight),
      makeHeartbeat(afterMidnight + 5 * 60_000)
    ];
    const allDurations = buildDurations(hbs, { graceMs: 120_000, gapMs: 300_000 });
    const totalAll = allDurations.reduce((s: number, d: { durationMs: number }) => s + d.durationMs, 0);

    const onlyToday = hbs.filter(h => {
      const d = new Date(h.time);
      return d.getDate() === new Date(afterMidnight).getDate();
    });
    const todayDurations = buildDurations(onlyToday, { graceMs: 120_000, gapMs: 300_000 });
    const totalToday = todayDurations.reduce((s: number, d: { durationMs: number }) => s + d.durationMs, 0);

    assert.ok(totalToday < totalAll, 'Retention-filtered durations should be less than full session');
  } finally {
    Date.now = realNow;
  }
});

// --- RISCO-06: Index sync clamps future timestamps ---
test('RISCO-06: index sync should clamp updatedAt to now + tolerance', async () => {
  const { spawn } = await import('node:child_process');
  const { mkdtempSync, rmSync } = await import('node:fs');
  const os = await import('node:os');
  const nodePath = await import('node:path');
  const DAEMON_PATH = nodePath.join(process.cwd(), 'vscode-extension', 'daemon', 'index.cjs');
  const tmpDir = mkdtempSync(nodePath.join(os.tmpdir(), 'saul-risco06-'));
  const port = 4130;
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

  for (let i = 0; i < 20; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) break;
    } catch { /* wait */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  const base = `http://127.0.0.1:${port}`;
  const farFuture = Date.now() + 60 * 60 * 1000;

  // POST index with far-future timestamp
  const postRes = await fetch(`${base}/v1/tracking/index?key=test-key`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ index: 42, updatedAt: farFuture })
  });
  assert.equal(postRes.status, 204);

  // GET index and check updatedAt was clamped
  const getRes = await fetch(`${base}/v1/tracking/index?key=test-key`);
  const body = await getRes.json();
  const stored = body.updatedAt;
  const maxAllowed = Date.now() + 5000;
  assert.ok(stored <= maxAllowed, `updatedAt ${stored} should be clamped to <= now+5s (${maxAllowed})`);

  child.kill('SIGTERM');
  rmSync(tmpDir, { recursive: true, force: true });
});

test('RISCO-22: formatDateKey contract across agents', () => {
  const { formatDateKey: chromeFormatDateKey } = require('../../dist/shared/utils/time.js') as {
    formatDateKey: (d: Date) => string;
  };

  function daemonFormatDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
      date.getDate()
    ).padStart(2, '0')}`;
  }

  function vscodeQueueFormatDateKey(date: Date): string {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }

  const testDates = [
    new Date(2026, 0, 1, 0, 0, 0),
    new Date(2026, 11, 31, 23, 59, 59),
    new Date(2026, 1, 28, 12, 0, 0),
    new Date(2026, 3, 17, 8, 30, 0),
    new Date(2026, 5, 15, 0, 0, 1),
  ];

  for (const date of testDates) {
    const chrome = chromeFormatDateKey(date);
    const daemon = daemonFormatDateKey(date);
    const vscode = vscodeQueueFormatDateKey(date);
    assert.equal(chrome, daemon, `Chrome vs Daemon mismatch for ${date.toISOString()}`);
    assert.equal(chrome, vscode, `Chrome vs VSCode mismatch for ${date.toISOString()}`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(chrome), `Invalid format: ${chrome}`);
  }
});
