/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
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

test('out_of_order_heartbeats_are_sorted_before_aggregation', () => {
  const realNow = Date.now;
  Date.now = () => 1_000_000;
  try {
    const hb1 = makeHeartbeat(50_000);
    const hb2 = makeHeartbeat(10_000);
    const hb3 = makeHeartbeat(30_000);
    const durations = buildDurations([hb1, hb2, hb3], { gapMs: 600_000, graceMs: 120_000 });
    assert.equal(durations.length, 1);
    assert.equal(durations[0].startTime, 10_000);
    assert.ok(durations[0].endTime >= 50_000);
  } finally {
    Date.now = realNow;
  }
});

test('gap_exactly_at_gapMs_boundary_does_not_split_session', () => {
  const gapMs = 5 * 60 * 1000;
  const realNow = Date.now;
  Date.now = () => 1_000_000;
  try {
    const hb1 = makeHeartbeat(1_000);
    const hb2 = makeHeartbeat(1_000 + gapMs);
    const durations = buildDurations([hb1, hb2], { gapMs, graceMs: 120_000 });
    assert.equal(durations.length, 1, 'delta === gapMs should NOT split (uses > not >=)');
  } finally {
    Date.now = realNow;
  }
});

test('gap_one_ms_over_gapMs_splits_session', () => {
  const gapMs = 5 * 60 * 1000;
  const realNow = Date.now;
  Date.now = () => 1_000_000;
  try {
    const hb1 = makeHeartbeat(1_000);
    const hb2 = makeHeartbeat(1_000 + gapMs + 1);
    const durations = buildDurations([hb1, hb2], { gapMs, graceMs: 120_000 });
    assert.equal(durations.length, 2, 'delta > gapMs should split into separate sessions');
  } finally {
    Date.now = realNow;
  }
});

test('single_heartbeat_recent_is_clamped_by_date_now', () => {
  const realNow = Date.now;
  const now = 10_000;
  Date.now = () => now;
  try {
    const durations = buildDurations([makeHeartbeat(now - 5_000)], { graceMs: 30_000, gapMs: 600_000 });
    assert.equal(durations.length, 1);
    assert.ok(durations[0].endTime <= now, 'endTime must not exceed Date.now()');
    assert.equal(durations[0].durationMs, 5_000, 'duration clamped to now - startTime');
  } finally {
    Date.now = realNow;
  }
});
