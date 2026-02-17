/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { isWithinWorkSchedule, splitDurationByHour } from '../shared/utils/time.js';

test('documents_current_behavior_splitDurationByHour_allows_future_time', () => {
  const now = Date.now();
  const start = now - 30 * 60 * 1000;
  const duration = 2 * 60 * 60 * 1000;
  const segments = splitDurationByHour(start, duration);
  const total = segments.reduce((sum, segment) => sum + segment.milliseconds, 0);
  assert.equal(total, duration);
});

test('documents_current_behavior_schedule_start_equals_end_allows_all_times', () => {
  const schedule = [{ start: '09:00', end: '09:00' }];
  const date = new Date('2024-01-01T03:00:00');
  assert.equal(isWithinWorkSchedule(date, schedule), true);
});

test('documents_current_behavior_overtime_uses_slice_start_only', () => {
  const schedule = [{ start: '09:00', end: '10:00' }];
  const sliceStart = new Date('2024-01-01T09:59:00');
  const sliceEnd = new Date('2024-01-01T10:01:00');
  assert.equal(isWithinWorkSchedule(sliceStart, schedule), true);
  assert.equal(isWithinWorkSchedule(sliceEnd, schedule), false);
});
