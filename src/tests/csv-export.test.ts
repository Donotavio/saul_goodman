/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultMetrics } from '../shared/storage.js';
import type { ContextHistory, FairnessSummary } from '../shared/types.js';
import { buildDetailedCsvSection, mapFairnessRule } from '../shared/utils/csv-detail.js';

const LABELS = {
  sectionTitle: 'Detailed timeline',
  startTime: 'Start',
  endTime: 'End',
  duration: 'Duration',
  domain: 'Domain',
  category: 'Category',
  context: 'Context',
  fairnessRule: 'Rule'
};

test('buildDetailedCsvSection appends header with granular columns and data rows', () => {
  const metrics = createDefaultMetrics();
  const baseTime = Date.UTC(2024, 0, 2, 12, 0, 0);
  metrics.timeline = [
    {
      startTime: baseTime,
      endTime: baseTime + 60_000,
      durationMs: 60_000,
      domain: 'docs.google.com',
      category: 'productive'
    }
  ];
  const history: ContextHistory = [
    { value: 'work', start: baseTime - 10_000, end: baseTime + 30_000 },
    { value: 'personal', start: baseTime + 30_000, end: baseTime + 120_000 }
  ];
  const fairness: FairnessSummary = {
    rule: 'manual-override',
    manualOverrideActive: true,
    contextMode: { value: 'work', updatedAt: baseTime },
    holidayNeutral: false,
    isHolidayToday: false
  };

  const lines = buildDetailedCsvSection({
    metrics,
    contextHistory: history,
    fairness,
    labels: LABELS
  });

  assert.equal(lines.length >= 3, true);
  assert.equal(lines[0], LABELS.sectionTitle);
  const header = [
    LABELS.startTime,
    LABELS.endTime,
    LABELS.duration,
    LABELS.domain,
    LABELS.category,
    LABELS.context,
    LABELS.fairnessRule
  ].join(',');
  assert.equal(lines[1], header);

  const rowParts = lines[2].split(',');
  assert.equal(rowParts[0], new Date(baseTime).toISOString());
  assert.equal(rowParts[1], new Date(baseTime + 60_000).toISOString());
  assert.equal(rowParts[2], '60000');
  assert.equal(rowParts[3], 'docs.google.com');
  assert.equal(rowParts[4], 'productive');
  assert.equal(rowParts[5], 'work');
  assert.equal(rowParts[6], 'manual');
});

test('buildDetailedCsvSection keeps inactive category without collapsing', () => {
  const metrics = createDefaultMetrics();
  const baseTime = Date.UTC(2024, 4, 10, 9, 0, 0);
  metrics.timeline = [
    {
      startTime: baseTime,
      endTime: baseTime + 30000,
      durationMs: 30000,
      domain: 'Idle',
      category: 'inactive'
    }
  ];

  const lines = buildDetailedCsvSection({
    metrics,
    labels: LABELS
  });

  const rowParts = lines[2].split(',');
  assert.equal(rowParts[4], 'inactive');
});

test('mapFairnessRule normalizes fairness summary into manual/context/holiday/normal buckets', () => {
  const manual: FairnessSummary = {
    rule: 'manual-override',
    manualOverrideActive: true,
    contextMode: { value: 'work', updatedAt: Date.now() },
    holidayNeutral: false,
    isHolidayToday: false
  };
  const contextual: FairnessSummary = {
    rule: 'context-personal',
    manualOverrideActive: false,
    contextMode: { value: 'personal', updatedAt: Date.now() },
    holidayNeutral: false,
    isHolidayToday: false
  };
  const normal: FairnessSummary = {
    rule: 'normal',
    manualOverrideActive: false,
    contextMode: { value: 'work', updatedAt: Date.now() },
    holidayNeutral: false,
    isHolidayToday: false
  };
  const holiday: FairnessSummary = {
    rule: 'holiday',
    manualOverrideActive: false,
    contextMode: { value: 'work', updatedAt: Date.now() },
    holidayNeutral: true,
    isHolidayToday: true
  };

  assert.equal(mapFairnessRule(manual), 'manual');
  assert.equal(mapFairnessRule(contextual), 'context');
  assert.equal(mapFairnessRule(holiday), 'holiday');
  assert.equal(mapFairnessRule(normal), 'normal');
  assert.equal(mapFairnessRule(undefined), 'normal');
});
