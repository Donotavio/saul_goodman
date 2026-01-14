/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ensureContextHistoryInitialized,
  closeOpenContextSegment,
  startContextSegment,
  aggregateContextDurations,
  buildContextBreakdown
} from '../shared/utils/context-history.js';
import { calculateProcrastinationIndex } from '../shared/score.js';
import { createDefaultMetrics, getDefaultSettings } from '../shared/storage.js';
import type { ContextHistory, ContextModeState } from '../shared/types.js';

test('context history closes and opens segments when switching', () => {
  const start = Date.now() - 2 * 60 * 1000;
  const workState: ContextModeState = { value: 'work', updatedAt: start };
  let history = ensureContextHistoryInitialized(undefined, workState, start);
  assert.equal(history.length, 1);
  assert.equal(history[0]?.value, 'work');
  assert.equal(history[0]?.start, start);
  assert.equal(history[0]?.end, undefined);

  const changeAt = start + 60 * 1000;
  history = closeOpenContextSegment(history, changeAt);
  history = startContextSegment(history, 'leisure', changeAt);

  assert.equal(history.length, 2);
  assert.equal(history[0]?.end, changeAt);
  assert.equal(history[1]?.start, changeAt);
  assert.equal(history[1]?.value, 'leisure');
  assert.equal(history[1]?.end, undefined);
});

test('aggregateContextDurations sums open segments up to now', () => {
  const now = Date.now();
  const history: ContextHistory = [
    { value: 'work', start: now - 30 * 60 * 1000, end: now - 15 * 60 * 1000 },
    { value: 'personal', start: now - 15 * 60 * 1000, end: now - 10 * 60 * 1000 },
    { value: 'leisure', start: now - 10 * 60 * 1000 } // aberto
  ];

  const totals = aggregateContextDurations(history, now);
  assert.equal(totals.work, 15 * 60 * 1000);
  assert.equal(totals.personal, 5 * 60 * 1000);
  assert.ok(totals.leisure >= 10 * 60 * 1000);
  assert.equal(totals.study, 0);
  assert.equal(totals.dayOff, 0);
  assert.equal(totals.vacation, 0);
});

test('buildContextBreakdown matches score calculation per context', () => {
  const now = Date.now();
  const metrics = createDefaultMetrics();
  metrics.productiveMs = 60 * 60 * 1000;
  metrics.procrastinationMs = 30 * 60 * 1000;
  metrics.inactiveMs = 15 * 60 * 1000;
  metrics.tabSwitches = 12;
  const settings = getDefaultSettings();
  const history: ContextHistory = [
    { value: 'work', start: now - 90 * 60 * 1000, end: now - 45 * 60 * 1000 },
    { value: 'study', start: now - 45 * 60 * 1000, end: now - 15 * 60 * 1000 },
    { value: 'personal', start: now - 15 * 60 * 1000 }
  ];

  const breakdown = buildContextBreakdown({ history, metrics, settings, now });
  const expectedWork = calculateProcrastinationIndex(metrics, settings, {
    contextMode: { value: 'work', updatedAt: now },
    manualOverride: undefined,
    holidayNeutral: false
  }).score;
  const expectedDayOff = calculateProcrastinationIndex(metrics, settings, {
    contextMode: { value: 'dayOff', updatedAt: now },
    manualOverride: undefined,
    holidayNeutral: false
  }).score;
  const expectedVacation = calculateProcrastinationIndex(metrics, settings, {
    contextMode: { value: 'vacation', updatedAt: now },
    manualOverride: undefined,
    holidayNeutral: false
  }).score;

  assert.equal(breakdown.indices.work, expectedWork);
  assert.equal(breakdown.indices.personal, 0);
  assert.equal(breakdown.indices.dayOff, expectedDayOff);
  assert.equal(breakdown.indices.vacation, expectedVacation);
  assert.equal(Object.values(breakdown.durations).reduce((acc, value) => acc + value, 0) > 0, true);
});
