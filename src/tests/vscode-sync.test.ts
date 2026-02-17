/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { clearVscodeMetrics } from '../shared/utils/vscode-sync.js';
import type { DailyMetrics } from '../shared/types.js';

function createMetrics(): DailyMetrics {
  return {
    dateKey: '2024-01-01',
    productiveMs: 0,
    procrastinationMs: 0,
    inactiveMs: 0,
    tabSwitches: 0,
    tabSwitchBreakdown: {
      productiveToProductive: 0,
      productiveToProcrastination: 0,
      productiveToNeutral: 0,
      procrastinationToProductive: 0,
      procrastinationToProcrastination: 0,
      procrastinationToNeutral: 0,
      neutralToProductive: 0,
      neutralToProcrastination: 0,
      neutralToNeutral: 0
    },
    tabSwitchHourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      productiveToProductive: 0,
      productiveToProcrastination: 0,
      productiveToNeutral: 0,
      procrastinationToProductive: 0,
      procrastinationToProcrastination: 0,
      procrastinationToNeutral: 0,
      neutralToProductive: 0,
      neutralToProcrastination: 0,
      neutralToNeutral: 0
    })),
    domains: {},
    currentIndex: 0,
    lastUpdated: Date.now(),
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      productiveMs: 0,
      procrastinationMs: 0,
      inactiveMs: 0,
      neutralMs: 0
    })),
    timeline: [],
    overtimeProductiveMs: 0,
    windowUnfocusedMs: 0,
    audibleProcrastinationMs: 0,
    spaNavigations: 0,
    groupedMs: 0,
    restoredItems: 0,
    vscodeActiveMs: 123,
    vscodeSessions: 2,
    vscodeSwitches: 4,
    vscodeSwitchHourly: Array.from({ length: 24 }, () => 1),
    vscodeTimeline: [{ startTime: 1, endTime: 2, durationMs: 1, domain: 'VS Code', category: 'productive' }]
  };
}

test('clearVscodeMetrics resets VS Code fields and reports changes', () => {
  const metrics = createMetrics();
  const changed = clearVscodeMetrics(metrics);
  assert.equal(changed, true);
  assert.equal(metrics.vscodeActiveMs, 0);
  assert.equal(metrics.vscodeSessions, 0);
  assert.equal(metrics.vscodeSwitches, 0);
  assert.ok(Array.isArray(metrics.vscodeSwitchHourly));
  assert.ok((metrics.vscodeSwitchHourly ?? []).every((value) => value === 0));
  assert.deepEqual(metrics.vscodeTimeline, []);

  // Second call should not report changes
  const changedAgain = clearVscodeMetrics(metrics);
  assert.equal(changedAgain, false);
});
