/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVscodeTrackingSummary } from '../shared/vscode-summary.js';

test('normalizeVscodeTrackingSummary maps daemon payload to timeline entries', () => {
  const payload = {
    totalActiveMs: 120000,
    sessions: 2,
    switchHourly: Array.from({ length: 24 }, (_, hour) => (hour === 9 ? 2 : 0)),
    timeline: [
      { startTime: 1000, endTime: 61000, durationMs: 60000 },
      { startTime: 70000, endTime: 130000, durationMs: 60000 }
    ]
  };

  const normalized = normalizeVscodeTrackingSummary(payload, {
    domainLabel: 'VS Code (IDE)',
    category: 'productive'
  });

  assert.equal(normalized.totalActiveMs, 120000);
  assert.equal(normalized.sessions, 2);
  assert.equal(normalized.switches, 2);
  assert.equal(normalized.switchHourly.length, 24);
  assert.equal(normalized.switchHourly[9], 2);
  assert.equal(normalized.timeline.length, 2);
  assert.equal(normalized.timeline[0]?.domain, 'VS Code (IDE)');
  assert.equal(normalized.timeline[0]?.category, 'productive');
});

test('normalizeVscodeTrackingSummary defaults missing fields safely', () => {
  const payload = {
    timeline: [{ startTime: 0, endTime: 30000 }]
  };

  const normalized = normalizeVscodeTrackingSummary(payload);

  assert.equal(normalized.totalActiveMs, 30000);
  assert.equal(normalized.sessions, 1);
  assert.equal(normalized.switches, 1);
  assert.equal(normalized.switchHourly.length, 24);
});
