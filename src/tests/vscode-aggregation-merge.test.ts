/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { mergeOverlappingSlices } = require('../../saul-daemon/src/vscode-aggregation.cjs');

test('mergeOverlappingSlices unions overlapping intervals', () => {
  const slices = [
    { startTime: 0, endTime: 60000, durationMs: 60000 },
    { startTime: 30000, endTime: 90000, durationMs: 60000 },
    { startTime: 100000, endTime: 110000, durationMs: 10000 },
    { startTime: 110000, endTime: 120000, durationMs: 10000 }
  ];

  const merged = mergeOverlappingSlices(slices);

  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.startTime, 0);
  assert.equal(merged[0]?.endTime, 90000);
  assert.equal(merged[0]?.durationMs, 90000);
  assert.equal(merged[1]?.startTime, 100000);
  assert.equal(merged[1]?.endTime, 120000);
  assert.equal(merged[1]?.durationMs, 20000);
});
