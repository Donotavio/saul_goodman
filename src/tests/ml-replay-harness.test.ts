/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { runReplayAblation, type ReplaySample } from '../shared/ml/replayHarness.js';

function buildSamples(total = 240): ReplaySample[] {
  const start = Date.UTC(2026, 2, 1, 12, 0, 0);
  const samples: ReplaySample[] = [];
  for (let i = 0; i < total; i += 1) {
    const label: 0 | 1 = i % 2 === 0 ? 1 : 0;
    const baselinePrediction: 0 | 1 = label === 1 ? 1 : i % 5 === 1 ? 1 : 0;
    const naturalPrediction: 0 | 1 = label === 1 ? 1 : i % 11 === 1 ? 1 : 0;
    const naturalSelfPrediction: 0 | 1 = label === 1 ? 1 : i % 13 === 1 ? 1 : 0;
    samples.push({
      timestamp: start + i * 60_000,
      label,
      baselinePrediction,
      naturalPrediction,
      naturalProbability: naturalPrediction === 1 ? 0.83 : 0.17,
      naturalSelfPrediction,
      naturalSelfProbability: naturalSelfPrediction === 1 ? 0.88 : 0.12,
      weight: 1
    });
  }
  return samples;
}

test('replay harness reports natural scenarios with reduced false productive rate', () => {
  const result = runReplayAblation(buildSamples(), {
    bootstrapIterations: 300,
    bootstrapSeed: 99,
    minSamples: 80
  });

  assert.equal(result.sampleSize, 240);
  const baseline = result.scenarios.find((scenario) => scenario.name === 'baseline');
  const natural = result.scenarios.find((scenario) => scenario.name === 'natural');
  const naturalSelf = result.scenarios.find((scenario) => scenario.name === 'natural+self');
  assert.ok(baseline);
  assert.ok(natural);
  assert.ok(naturalSelf);
  assert.ok((natural?.summary.falseProductiveRate ?? 1) < (baseline?.summary.falseProductiveRate ?? 1));
  assert.ok((naturalSelf?.summary.falseProductiveRate ?? 1) <= (natural?.summary.falseProductiveRate ?? 1));
});
