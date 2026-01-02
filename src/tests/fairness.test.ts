/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateProcrastinationIndex } from '../shared/score.js';
import { resolveHolidayNeutralState } from '../shared/utils/holidays.js';
import type {
  ContextModeState,
  DailyMetrics,
  ExtensionSettings,
  HolidaysCache,
  ManualOverrideState
} from '../shared/types.js';

const baseSettings: ExtensionSettings = {
  productiveDomains: ['docs.google.com'],
  procrastinationDomains: ['youtube.com'],
  weights: {
    procrastinationWeight: 0.6,
    tabSwitchWeight: 0.25,
    inactivityWeight: 0.15
  },
  inactivityThresholdMs: 60000,
  locale: 'pt-BR',
  workSchedule: [
    { start: '08:00', end: '12:00' },
    { start: '13:00', end: '18:00' }
  ],
  criticalScoreThreshold: 90,
  criticalSoundEnabled: false,
  holidayAutoEnabled: true,
  holidayCountryCode: 'BR'
};

const defaultContext: ContextModeState = { value: 'work', updatedAt: Date.now() };

function createMetrics(overrides: Partial<DailyMetrics> = {}): DailyMetrics {
  return {
    dateKey: '2024-01-01',
    productiveMs: 60 * 60000,
    procrastinationMs: 30 * 60000,
    inactiveMs: 15 * 60000,
    tabSwitches: 10,
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
    ...overrides
  };
}

test('manual override blocks scoring entirely', () => {
  const metrics = createMetrics({ productiveMs: 120 * 60000, procrastinationMs: 90 * 60000 });
  const manual: ManualOverrideState = { enabled: true, date: metrics.dateKey };
  const result = calculateProcrastinationIndex(metrics, baseSettings, {
    manualOverride: manual,
    contextMode: defaultContext,
    holidayNeutral: false
  });
  assert.equal(result.score, 0);
  assert.equal(result.rule, 'manual-override');
  assert.equal(result.manualOverrideActive, true);
});

test('context modes adjust scoring weights', () => {
  const metrics = createMetrics({ productiveMs: 60 * 60000, procrastinationMs: 60 * 60000 });
  const work = calculateProcrastinationIndex(metrics, baseSettings);
  const study = calculateProcrastinationIndex(metrics, baseSettings, {
    contextMode: { value: 'study', updatedAt: Date.now() }
  });
  const personal = calculateProcrastinationIndex(metrics, baseSettings, {
    contextMode: { value: 'personal', updatedAt: Date.now() }
  });
  const dayOff = calculateProcrastinationIndex(metrics, baseSettings, {
    contextMode: { value: 'dayOff', updatedAt: Date.now() }
  });
  const vacation = calculateProcrastinationIndex(metrics, baseSettings, {
    contextMode: { value: 'vacation', updatedAt: Date.now() }
  });
  assert.ok(study.score < work.score, 'study mode should soften the index');
  assert.equal(personal.score, 0);
  assert.equal(personal.rule, 'context-personal');
  assert.equal(dayOff.score, 0);
  assert.equal(dayOff.rule, 'context-day-off');
  assert.equal(vacation.score, 0);
  assert.equal(vacation.rule, 'context-vacation');
});

test('holiday neutralization is cached and opt-in', async () => {
  const cache: HolidaysCache = {};
  let fetchCount = 0;
  const fakeFetch: typeof fetch = (async () => {
    fetchCount += 1;
    return {
      ok: true,
      json: async () => [{ date: '2024-01-01', global: true, types: ['Public'] }]
    } as unknown as Response;
  }) as typeof fetch;
  const first = await resolveHolidayNeutralState({
    dateKey: '2024-01-01',
    countryCode: 'BR',
    enabled: true,
    cache,
    fetcher: fakeFetch,
    now: new Date('2024-01-01T00:00:00Z').getTime()
  });
  assert.equal(first.isHoliday, true);
  assert.equal(first.source, 'api');
  const second = await resolveHolidayNeutralState({
    dateKey: '2024-01-02',
    countryCode: 'BR',
    enabled: true,
    cache: first.cache,
    fetcher: async () => {
      assert.ok(false, 'should use cache, not fetch again');
      return {} as Response;
    },
    now: new Date('2024-01-02T00:00:00Z').getTime()
  });
  assert.equal(second.source, 'cache');
  assert.equal(fetchCount, 1);
});

test('holiday guard neutralizes the score when API marks the date', async () => {
  const metrics = createMetrics({ dateKey: '2025-01-01' });
  const fakeFetch: typeof fetch = (async () => {
    return {
      ok: true,
      json: async () => [
        { date: '2025-01-01', global: true, types: ['Public'] },
        { date: '2025-01-02', global: true, types: ['Public'] }
      ]
    } as unknown as Response;
  }) as typeof fetch;

  const resolution = await resolveHolidayNeutralState({
    dateKey: metrics.dateKey,
    countryCode: 'BR',
    enabled: true,
    cache: {},
    fetcher: fakeFetch,
    now: new Date('2025-01-01T00:00:00Z').getTime()
  });

  assert.equal(resolution.isHoliday, true);
  const result = calculateProcrastinationIndex(metrics, baseSettings, {
    contextMode: defaultContext,
    holidayNeutral: resolution.isHoliday
  });
  assert.equal(result.rule, 'holiday');
  assert.equal(result.score, 0);
});

test('manual override precedes context and holiday guards', () => {
  const metrics = createMetrics();
  const result = calculateProcrastinationIndex(metrics, baseSettings, {
    manualOverride: { enabled: true, date: metrics.dateKey },
    contextMode: { value: 'leisure', updatedAt: Date.now() },
    holidayNeutral: true
  });
  assert.equal(result.rule, 'manual-override');
  assert.equal(result.score, 0);
});
