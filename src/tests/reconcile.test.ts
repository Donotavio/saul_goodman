/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileMetricsFromTimeline } from '../shared/reconcile.js';
import { createDefaultMetrics, getDefaultSettings, createEmptyHourly } from '../shared/storage.js';
import type { DailyMetrics, ExtensionSettings, TimelineEntry } from '../shared/types.js';

function makeSettings(overrides?: Partial<ExtensionSettings>): ExtensionSettings {
  return { ...getDefaultSettings(), ...overrides };
}

function makeMetrics(overrides?: Partial<DailyMetrics>): DailyMetrics {
  return { ...createDefaultMetrics(), ...overrides };
}

function entry(
  domain: string,
  category: 'productive' | 'procrastination' | 'neutral' | 'inactive',
  durationMs: number,
  startHour = 10
): TimelineEntry {
  const startTime = new Date(2024, 0, 15, startHour, 0, 0).getTime();
  return {
    startTime,
    endTime: startTime + durationMs,
    durationMs,
    domain,
    category
  };
}

test('recalculates buckets when domain changes category', () => {
  const settings = makeSettings({
    productiveDomains: ['github.com'],
    procrastinationDomains: []
  });
  // Timeline has github.com classified as procrastination (old classification)
  const metrics = makeMetrics({
    productiveMs: 0,
    procrastinationMs: 60000,
    timeline: [entry('github.com', 'procrastination', 60000)],
    domains: {
      'github.com': { domain: 'github.com', milliseconds: 60000, category: 'procrastination' }
    }
  });

  reconcileMetricsFromTimeline(metrics, settings);

  assert.equal(metrics.productiveMs, 60000);
  assert.equal(metrics.procrastinationMs, 0);
  assert.equal(metrics.domains['github.com'].category, 'productive');
  assert.equal(metrics.timeline[0].category, 'productive');
});

test('preserves inactiveMs and skips inactive entries', () => {
  const settings = makeSettings({
    productiveDomains: ['docs.google.com'],
    procrastinationDomains: ['youtube.com']
  });
  const hourly = createEmptyHourly();
  hourly[10].inactiveMs = 30000;

  const metrics = makeMetrics({
    inactiveMs: 30000,
    timeline: [
      entry('docs.google.com', 'productive', 50000),
      entry('__idle', 'inactive', 30000),
      entry('youtube.com', 'procrastination', 20000)
    ],
    hourly
  });

  reconcileMetricsFromTimeline(metrics, settings);

  assert.equal(metrics.productiveMs, 50000);
  assert.equal(metrics.procrastinationMs, 20000);
  // inactiveMs in hourly should be preserved
  assert.equal(metrics.hourly[10].inactiveMs, 30000);
  // inactive timeline entry should NOT have its category changed
  assert.equal(metrics.timeline[1].category, 'inactive');
});

test('empty timeline zeros out derived fields', () => {
  const settings = makeSettings();
  const metrics = makeMetrics({
    productiveMs: 100000,
    procrastinationMs: 50000,
    overtimeProductiveMs: 10000,
    timeline: [],
    domains: {
      'example.com': { domain: 'example.com', milliseconds: 100000, category: 'productive' }
    }
  });

  reconcileMetricsFromTimeline(metrics, settings);

  assert.equal(metrics.productiveMs, 0);
  assert.equal(metrics.procrastinationMs, 0);
  assert.equal(metrics.overtimeProductiveMs, 0);
  assert.deepEqual(metrics.domains, {});
});

test('recalculates overtimeProductiveMs respecting workSchedule', () => {
  const settings = makeSettings({
    productiveDomains: ['github.com'],
    workSchedule: [{ start: '09:00', end: '12:00' }]
  });
  // Entry at 10:00 — within schedule
  const inSchedule = entry('github.com', 'neutral', 60000, 10);
  // Entry at 20:00 — outside schedule (overtime)
  const overtime = entry('github.com', 'neutral', 40000, 20);

  const metrics = makeMetrics({
    timeline: [inSchedule, overtime]
  });

  reconcileMetricsFromTimeline(metrics, settings);

  assert.equal(metrics.productiveMs, 100000);
  assert.equal(metrics.overtimeProductiveMs, 40000);
});

test('reconstructs domains record with current categories', () => {
  const settings = makeSettings({
    productiveDomains: ['slack.com'],
    procrastinationDomains: ['reddit.com']
  });
  const metrics = makeMetrics({
    timeline: [
      entry('slack.com', 'neutral', 30000),
      entry('reddit.com', 'neutral', 20000),
      entry('unknown.com', 'neutral', 10000)
    ],
    domains: {}
  });

  reconcileMetricsFromTimeline(metrics, settings);

  assert.equal(metrics.domains['slack.com'].category, 'productive');
  assert.equal(metrics.domains['slack.com'].milliseconds, 30000);
  assert.equal(metrics.domains['reddit.com'].category, 'procrastination');
  assert.equal(metrics.domains['reddit.com'].milliseconds, 20000);
  assert.equal(metrics.domains['unknown.com'].category, 'neutral');
  assert.equal(metrics.domains['unknown.com'].milliseconds, 10000);
});

test('hourly buckets reflect current classifications', () => {
  const settings = makeSettings({
    productiveDomains: ['github.com'],
    procrastinationDomains: ['youtube.com']
  });
  const metrics = makeMetrics({
    timeline: [
      entry('github.com', 'neutral', 60000, 14),
      entry('youtube.com', 'neutral', 30000, 14)
    ]
  });

  reconcileMetricsFromTimeline(metrics, settings);

  assert.equal(metrics.hourly[14].productiveMs, 60000);
  assert.equal(metrics.hourly[14].procrastinationMs, 30000);
  assert.equal(metrics.hourly[14].neutralMs, 0);
});

test('preserves inactive virtual domains not in timeline', () => {
  const settings = makeSettings();
  const metrics = makeMetrics({
    timeline: [entry('example.com', 'neutral', 10000)],
    domains: {
      '__vscode:ide': { domain: '__vscode:ide', milliseconds: 50000, category: 'inactive' as never }
    }
  });

  reconcileMetricsFromTimeline(metrics, settings);

  assert.equal(metrics.domains['__vscode:ide'].milliseconds, 50000);
  assert.equal(metrics.domains['__vscode:ide'].category, 'inactive');
  assert.equal(metrics.domains['example.com'].category, 'neutral');
});

test('aggregates multiple entries for same domain', () => {
  const settings = makeSettings({
    productiveDomains: ['github.com']
  });
  const metrics = makeMetrics({
    timeline: [
      entry('github.com', 'neutral', 30000, 9),
      entry('github.com', 'neutral', 20000, 11)
    ]
  });

  reconcileMetricsFromTimeline(metrics, settings);

  assert.equal(metrics.domains['github.com'].milliseconds, 50000);
  assert.equal(metrics.productiveMs, 50000);
});
