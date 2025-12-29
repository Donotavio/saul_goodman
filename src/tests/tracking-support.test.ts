/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { isWithinWorkSchedule, splitDurationByHour } from '../shared/utils/time.js';
import { classifyDomain } from '../shared/utils/domain.js';
import { calculateProcrastinationIndex } from '../shared/score.js';
import { shouldTriggerCriticalForUrl } from '../shared/critical.js';
import { getTabSwitchKey, recordTabSwitchCounts } from '../shared/tab-switch.js';
import type {
  DailyMetrics,
  ExtensionSettings,
  TabSwitchBreakdown,
  TabSwitchHourlyBucket,
  WorkInterval
} from '../shared/types.js';

const baseSchedule: WorkInterval[] = [
  { start: '08:00', end: '12:00' },
  { start: '13:30', end: '18:00' }
];

const defaultSettings: ExtensionSettings = {
  productiveDomains: ['docs.google.com'],
  procrastinationDomains: ['youtube.com'],
  weights: {
    procrastinationWeight: 0.6,
    tabSwitchWeight: 0.25,
    inactivityWeight: 0.15
  },
  inactivityThresholdMs: 60000,
  locale: 'pt-BR',
  openAiKey: '',
  criticalScoreThreshold: 90,
  workSchedule: baseSchedule,
  criticalSoundEnabled: false
};

function createEmptyBreakdown(): TabSwitchBreakdown {
  return {
    productiveToProductive: 0,
    productiveToProcrastination: 0,
    productiveToNeutral: 0,
    procrastinationToProductive: 0,
    procrastinationToProcrastination: 0,
    procrastinationToNeutral: 0,
    neutralToProductive: 0,
    neutralToProcrastination: 0,
    neutralToNeutral: 0
  };
}

function createEmptyTabSwitchHourly(): TabSwitchHourlyBucket[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    ...createEmptyBreakdown()
  }));
}

function createMetrics(overrides: Partial<DailyMetrics> = {}): DailyMetrics {
  return {
    dateKey: '2024-01-01',
    productiveMs: 0,
    procrastinationMs: 0,
    inactiveMs: 0,
    tabSwitches: 0,
    tabSwitchBreakdown: createEmptyBreakdown(),
    tabSwitchHourly: createEmptyTabSwitchHourly(),
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
    ...overrides
  };
}

test('isWithinWorkSchedule respects configured intervals', () => {
  const morning = new Date('2024-03-20T08:30:00');
  const lunch = new Date('2024-03-20T12:30:00');
  const evening = new Date('2024-03-20T19:00:00');

  assert.equal(isWithinWorkSchedule(morning, baseSchedule), true);
  assert.equal(isWithinWorkSchedule(lunch, baseSchedule), false);
  assert.equal(isWithinWorkSchedule(evening, baseSchedule), false);
});

test('splitDurationByHour breaks slices across hours', () => {
  const start = new Date('2024-03-20T10:50:00').getTime();
  const segments = splitDurationByHour(start, 20 * 60000);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].hour, 10);
  assert.equal(Math.round(segments[0].milliseconds / 60000), 10);
  assert.equal(segments[1].hour, 11);
  assert.equal(Math.round(segments[1].milliseconds / 60000), 10);
});

test('classifyDomain matches only true subdomains', () => {
  assert.equal(classifyDomain('docs.google.com', defaultSettings), 'productive');
  assert.equal(classifyDomain('intranet.docs.google.com', defaultSettings), 'productive');
  assert.equal(classifyDomain('nao-google.com', defaultSettings), 'neutral');
  assert.equal(classifyDomain('custom.youtube.com', defaultSettings), 'procrastination');
});

test('calculateProcrastinationIndex awards overtime bonus', () => {
  const metrics = createMetrics({
    productiveMs: 60 * 60000,
    overtimeProductiveMs: 30 * 60000,
    procrastinationMs: 30 * 60000,
    inactiveMs: 0,
    tabSwitches: 0
  });
  const result = calculateProcrastinationIndex(metrics, defaultSettings);
  assert.ok(result.score < 30, 'overtime produtivo deveria diminuir o índice');
});

test('recordTabSwitchCounts increments breakdown and hourly buckets', () => {
  const breakdown = createEmptyBreakdown();
  const hourly = createEmptyTabSwitchHourly();
  const timestamp = new Date('2024-03-20T15:10:00').getTime();

  const key = recordTabSwitchCounts(
    breakdown,
    hourly,
    timestamp,
    'productive',
    'procrastination'
  );

  assert.equal(key, 'productiveToProcrastination');
  assert.equal(breakdown.productiveToProcrastination, 1);
  assert.equal(hourly[15].productiveToProcrastination, 1);
  assert.equal(hourly[10].productiveToProcrastination, 0);

  const nullKey = getTabSwitchKey('productive', 'productive');
  assert.equal(nullKey, 'productiveToProductive');
});

test('shouldTriggerCriticalForUrl ignora produtivos e alerta casos desconhecidos', () => {
  assert.equal(
    shouldTriggerCriticalForUrl('https://docs.google.com/document/d/foo', defaultSettings),
    false
  );
  assert.equal(
    shouldTriggerCriticalForUrl('https://www.youtube.com/watch?v=abc', defaultSettings),
    true
  );
  assert.equal(shouldTriggerCriticalForUrl(undefined, defaultSettings), true);
});
