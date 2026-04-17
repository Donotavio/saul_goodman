/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';
import { determineSplit } from '../shared/ml/trainingStore.js';
import type { TrainingSplit } from '../shared/ml/trainingStore.js';

function makeExample(overrides: {
  domain?: string;
  createdAt?: number;
  source?: 'explicit' | 'implicit';
  label?: 0 | 1;
}) {
  return {
    domain: overrides.domain ?? 'example.com',
    createdAt: overrides.createdAt ?? 1700000000000,
    source: overrides.source ?? 'explicit',
    label: overrides.label ?? 1,
    weight: 1,
    vector: { indices: [0] as number[], values: [1] as number[] },
  };
}

test('determineSplit is deterministic — same input always returns same split', () => {
  const ex = makeExample({ domain: 'github.com', createdAt: 1700000000000, label: 1 });
  const first = determineSplit(ex);
  for (let i = 0; i < 50; i++) {
    assert.equal(determineSplit(ex), first);
  }
});

test('implicit source always routes to train split', () => {
  const domains = ['youtube.com', 'reddit.com', 'docs.google.com', 'twitter.com', 'stackoverflow.com'];
  for (const domain of domains) {
    for (const label of [0, 1] as const) {
      for (const ts of [1700000000000, 1700100000000, 1700200000000]) {
        const split = determineSplit(makeExample({ domain, createdAt: ts, source: 'implicit', label }));
        assert.equal(split, 'train', `implicit ${domain} label=${label} ts=${ts} got ${split}`);
      }
    }
  }
});

test('explicit examples distribute across all three splits', () => {
  const counts: Record<TrainingSplit, number> = { train: 0, calibration: 0, test: 0 };
  for (let i = 0; i < 1000; i++) {
    const split = determineSplit(makeExample({
      domain: `domain-${i}.com`,
      createdAt: 1700000000000 + i * 60000,
      source: 'explicit',
      label: (i % 2) as 0 | 1,
    }));
    counts[split]++;
  }
  assert.ok(counts.train > 0, 'no train examples');
  assert.ok(counts.calibration > 0, 'no calibration examples');
  assert.ok(counts.test > 0, 'no test examples');
});

test('same domain with identical params always gets same split', () => {
  const params = { domain: 'notion.so', createdAt: 1700050000000, label: 1 as const, source: 'explicit' as const };
  const expected = determineSplit(makeExample(params));
  for (let i = 0; i < 100; i++) {
    assert.equal(determineSplit(makeExample(params)), expected);
  }
});

test('group-based split: same domain always maps to same split regardless of timestamp, label or source', () => {
  const domains = ['github.com', 'reddit.com', 'docs.google.com', 'notion.so', 'stackoverflow.com'];
  for (const domain of domains) {
    const baseline = determineSplit(makeExample({ domain, createdAt: 1700000000000, label: 1, source: 'explicit' }));
    // different timestamps
    for (const ts of [1700100000000, 1700200000000, 1800000000000]) {
      assert.equal(
        determineSplit(makeExample({ domain, createdAt: ts, label: 1, source: 'explicit' })),
        baseline,
        `${domain} split changed with different timestamp ${ts}`
      );
    }
    // different labels
    for (const label of [0, 1] as const) {
      assert.equal(
        determineSplit(makeExample({ domain, createdAt: 1700000000000, label, source: 'explicit' })),
        baseline,
        `${domain} split changed with different label ${label}`
      );
    }
  }
});

test('distribution roughly matches 70/15/15 across many samples', () => {
  const counts: Record<TrainingSplit, number> = { train: 0, calibration: 0, test: 0 };
  const N = 5000;
  for (let i = 0; i < N; i++) {
    const split = determineSplit(makeExample({
      domain: `d${i}.example.org`,
      createdAt: 1700000000000 + i * 1000,
      source: 'explicit',
      label: (i % 2) as 0 | 1,
    }));
    counts[split]++;
  }
  const trainPct = (counts.train / N) * 100;
  const calPct = (counts.calibration / N) * 100;
  const testPct = (counts.test / N) * 100;

  assert.ok(trainPct > 60 && trainPct < 80, `train ${trainPct.toFixed(1)}% outside 60-80`);
  assert.ok(calPct > 8 && calPct < 22, `calibration ${calPct.toFixed(1)}% outside 8-22`);
  assert.ok(testPct > 8 && testPct < 22, `test ${testPct.toFixed(1)}% outside 8-22`);
});
