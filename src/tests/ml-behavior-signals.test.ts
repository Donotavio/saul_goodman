/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateDomainBehavior,
  buildBehaviorFeatureMap,
  deriveImplicitLabel,
  type DomainBehaviorEvent
} from '../shared/ml/behaviorSignals.js';

const NOW = Date.UTC(2026, 2, 10, 15, 0, 0);

function eventAt(hoursAgo: number, overrides: Partial<DomainBehaviorEvent> = {}): DomainBehaviorEvent {
  return {
    domain: 'example.com',
    timestamp: NOW - Math.floor(hoursAgo * 60 * 60 * 1000),
    activeMs: 240_000,
    interactionCount: 8,
    hasFeedLayout: false,
    hasAutoplayMedia: false,
    hasShortsPattern: false,
    audible: false,
    outOfSchedule: false,
    ...overrides
  };
}

test('deriveImplicitLabel returns productive only when conservative criteria are met', () => {
  const stats = aggregateDomainBehavior([
    eventAt(2, { interactionCount: 8, activeMs: 240_000 }),
    eventAt(10, { interactionCount: 7, activeMs: 300_000 }),
    eventAt(24, { interactionCount: 6, activeMs: 200_000 }),
    eventAt(48, { interactionCount: 7, activeMs: 220_000 })
  ], NOW);

  const decision = deriveImplicitLabel(stats);
  assert.deepEqual(decision, {
    label: 1,
    weight: 0.25,
    reason: 'implicit:productive'
  });
});

test('deriveImplicitLabel returns procrastination when distraction or audio ratio is high', () => {
  const stats = aggregateDomainBehavior([
    eventAt(2, { hasFeedLayout: true, audible: true, activeMs: 180_000 }),
    eventAt(8, { hasAutoplayMedia: true, activeMs: 220_000 }),
    eventAt(24, { hasShortsPattern: true, activeMs: 160_000 }),
    eventAt(72, { hasFeedLayout: true, activeMs: 200_000 })
  ], NOW);

  const decision = deriveImplicitLabel(stats);
  assert.deepEqual(decision, {
    label: 0,
    weight: 0.25,
    reason: 'implicit:procrastination'
  });
});

test('deriveImplicitLabel abstains outside minimum session criteria', () => {
  const stats = aggregateDomainBehavior([
    eventAt(2, { activeMs: 600_000, interactionCount: 20 }),
    eventAt(8, { activeMs: 600_000, interactionCount: 20 }),
    eventAt(24, { activeMs: 600_000, interactionCount: 20 })
  ], NOW);

  assert.equal(deriveImplicitLabel(stats), null);
});

test('buildBehaviorFeatureMap includes expected behavioral families', () => {
  const stats = aggregateDomainBehavior([
    eventAt(2, { outOfSchedule: true, audible: true, hasFeedLayout: true }),
    eventAt(10, { outOfSchedule: true, activeMs: 30_000 }),
    eventAt(24, { activeMs: 90_000 }),
    eventAt(72, { interactionCount: 1, activeMs: 45_000 })
  ], NOW);

  const features = buildBehaviorFeatureMap(stats);
  assert.ok(Object.keys(features).some((key) => key.startsWith('beh:freq1d:')));
  assert.ok(Object.keys(features).some((key) => key.startsWith('beh:median_active:')));
  assert.ok(Object.keys(features).some((key) => key.startsWith('beh:interaction_rate:')));
  assert.ok(Object.keys(features).some((key) => key.startsWith('beh:audible_ratio:')));
  assert.ok(Object.keys(features).some((key) => key.startsWith('beh:overtime_ratio:')));
});
