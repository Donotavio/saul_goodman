/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { buildDurations } = require('../../saul-daemon/src/vscode-aggregation.cjs');

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

test('documents_current_behavior_min_duration_for_single_heartbeat', () => {
  const realNow = Date.now;
  Date.now = () => 1_000_000;
  try {
    const durations = buildDurations([makeHeartbeat(1_000)], { graceMs: 5000, gapMs: 600000 });
    assert.equal(durations.length, 1);
    assert.equal(durations[0].durationMs, 5000);
  } finally {
    Date.now = realNow;
  }
});

test('documents_current_behavior_session_extends_by_grace_after_last_heartbeat', () => {
  const realNow = Date.now;
  Date.now = () => 1_000_000;
  try {
    const hb1 = makeHeartbeat(1_000);
    const hb2 = makeHeartbeat(11_000);
    const durations = buildDurations([hb1, hb2], { gapMs: 600000, graceMs: 600000 });
    assert.equal(durations.length, 1);
    assert.equal(durations[0].durationMs, 610_000);
  } finally {
    Date.now = realNow;
  }
});

test('documents_current_behavior_gap_exceeds_splits_into_min_duration_sessions', () => {
  const realNow = Date.now;
  Date.now = () => 1_000_000;
  try {
    const hb1 = makeHeartbeat(1_000);
    const hb2 = makeHeartbeat(1_000 + 6 * 60 * 1000);
    const hb3 = makeHeartbeat(1_000 + 12 * 60 * 1000);
    const durations = buildDurations(
      [hb1, hb2, hb3],
      { gapMs: 5 * 60 * 1000, graceMs: 2 * 60 * 1000 }
    );
    assert.equal(durations.length, 3);
    assert.equal(durations[0].durationMs, 30_000);
  } finally {
    Date.now = realNow;
  }
});
