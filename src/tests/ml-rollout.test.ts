/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialRollout,
  createEmptyConfusion,
  maybePromoteRollout,
  resolveVariantByRollout,
  type ShadowMetrics,
  type RolloutState
} from '../shared/ml/rollout.js';

const DAY = 24 * 60 * 60 * 1000;

function makePassingShadow(explicitCount: number): ShadowMetrics {
  return {
    explicitCount,
    v1: { tp: 50, fp: 20, tn: 40, fn: 30 },
    v2: { tp: 62, fp: 16, tn: 50, fn: 22 },
    lastUpdated: Date.now()
  };
}

test('rollout keeps v1 in shadow and uses stable bucket in AB stages', () => {
  const rollout = createInitialRollout(Date.now(), 7);
  assert.equal(resolveVariantByRollout(rollout), 'v1');

  const ab10: RolloutState = { ...rollout, stage: 'ab10' };
  assert.equal(resolveVariantByRollout(ab10), 'v2');

  const ab50: RolloutState = { ...rollout, stage: 'ab50', installBucket: 67 };
  assert.equal(resolveVariantByRollout(ab50), 'v1');
});

test('rollout promotes shadow -> ab10 when window met and gate passes', () => {
  const startedAt = Date.now() - 15 * DAY;
  const rollout: RolloutState = {
    stage: 'shadow',
    installBucket: 42,
    shadowStartedAt: startedAt,
    stageStartedAt: startedAt,
    lastGateEvaluationAt: 0
  };

  const result = maybePromoteRollout(rollout, makePassingShadow(420), Date.now());
  assert.equal(result.state.stage, 'ab10');
  assert.equal(result.gate.passed, true);
});

test('rollout does not promote when gate fails', () => {
  const now = Date.now();
  const rollout: RolloutState = {
    stage: 'shadow',
    installBucket: 42,
    shadowStartedAt: now - 20 * DAY,
    stageStartedAt: now - 20 * DAY,
    lastGateEvaluationAt: 0
  };
  const failing: ShadowMetrics = {
    explicitCount: 500,
    v1: createEmptyConfusion(),
    v2: createEmptyConfusion(),
    lastUpdated: now
  };

  const result = maybePromoteRollout(rollout, failing, now);
  assert.equal(result.state.stage, 'shadow');
  assert.equal(result.gate.passed, false);
});
