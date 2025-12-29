/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDateKey, getTodayKey } from '../shared/utils/time.js';

test('formatDateKey always pads month and day', () => {
  const sample = new Date('2024-01-05T12:30:00Z');
  assert.equal(formatDateKey(sample), '2024-01-05');
});

test('getTodayKey reuses formatDateKey', () => {
  const reference = new Date(Date.UTC(2024, 8, 3, 12, 0, 0));
  assert.equal(getTodayKey(reference), '2024-09-03');
});
