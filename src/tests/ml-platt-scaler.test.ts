/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { PlattScaler } from '../shared/ml/plattScaler.js';

test('platt scaler preserves monotonicity after fit', () => {
  const scaler = new PlattScaler();
  const samples = Array.from({ length: 60 }, (_, i) => {
    const score = -3 + i * 0.1;
    return {
      score,
      label: (i >= 30 ? 1 : 0) as 0 | 1,
      weight: 1
    };
  });

  const result = scaler.fit(samples);
  assert.equal(result.changed, true);
  assert.equal(result.holdoutSize, 60);

  let previous = 0;
  for (let i = 0; i <= 60; i += 1) {
    const score = -3 + i * 0.1;
    const probability = scaler.transform(score);
    assert.ok(probability >= previous - 1e-12, `non-monotonic at score=${score}`);
    previous = probability;
  }

  const state = scaler.getState();
  assert.ok(state.ece >= 0 && state.ece <= 1);
});

test('platt scaler keeps previous state when holdout is too small', () => {
  const scaler = new PlattScaler();
  const samples = Array.from({ length: 10 }, (_, i) => ({
    score: i,
    label: (i % 2) as 0 | 1,
    weight: 1
  }));

  const result = scaler.fit(samples);
  assert.equal(result.changed, false);
  assert.equal(result.holdoutSize, 0);
});
