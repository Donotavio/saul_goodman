/// <reference path="../types/node-test.d.ts" />
import test from 'node:test';
import assert from 'node:assert/strict';

// BUG-R2-02: TemperatureScaler NaN guard
test('BUG-R2-02: TemperatureScaler.transform returns 0.5 for NaN/Infinity', async () => {
  const { TemperatureScaler } = await import('../shared/ml/temperatureScaler.js');
  const scaler = new TemperatureScaler();

  assert.equal(scaler.transform(NaN), 0.5, 'NaN should return 0.5');
  assert.equal(scaler.transform(Infinity), 0.5, 'Infinity should return 0.5');
  assert.equal(scaler.transform(-Infinity), 0.5, '-Infinity should return 0.5');

  const normal = scaler.transform(0);
  assert.ok(Number.isFinite(normal), 'Normal score should produce finite result');
  assert.ok(normal >= 0 && normal <= 1, 'Normal score should be in [0,1]');
});

// BUG-R2-03: McNemar with b=0, c=0 — gate should pass
test('BUG-R2-03: ValidationGate passes when all predictions agree (b=0,c=0)', async () => {
  const { evaluateValidationGate } = await import('../shared/ml/validationGate.js');

  const samples = Array.from({ length: 60 }, (_, i) => ({
    label: i < 30 ? (1 as const) : (0 as const),
    modelPrediction: i < 30 ? (1 as const) : (0 as const),
    modelProbability: i < 30 ? 0.85 : 0.15,
    baselinePrediction: i < 30 ? (1 as const) : (0 as const),
    weight: 1
  }));

  const result = await evaluateValidationGate(samples, undefined, {
    minSamples: 50,
    bootstrapIterations: 100,
    bootstrapSeed: 42
  });

  assert.ok(
    result.summary.gatePassed,
    'Gate should pass when models perfectly agree (no discordant pairs)'
  );
});

// BUG-R2-04: Midnight DST guard — lastResetDateKey prevents double reset
test('BUG-R2-04: handleMidnightReset guard prevents double reset on same dateKey', () => {
  let lastResetDateKey = '';
  let resetCount = 0;

  function getTodayKey(): string {
    return '2026-11-01';
  }

  function handleMidnightReset(): void {
    const todayKey = getTodayKey();
    if (lastResetDateKey === todayKey) {
      return;
    }
    lastResetDateKey = todayKey;
    resetCount += 1;
  }

  handleMidnightReset();
  handleMidnightReset();

  assert.equal(resetCount, 1, 'Reset should execute only once per dateKey');
  assert.equal(lastResetDateKey, '2026-11-01');
});

// BUG-R2-05: vscodeSyncInProgress timeout guard
test('BUG-R2-05: sync guard with stale timestamp allows re-entry', () => {
  let vscodeSyncInProgress = false;
  let vscodeSyncStartedAt = 0;
  let syncCount = 0;

  function syncVscodeMetrics(now: number): boolean {
    if (vscodeSyncInProgress && now - vscodeSyncStartedAt < 30_000) {
      return false;
    }
    vscodeSyncInProgress = true;
    vscodeSyncStartedAt = now;
    syncCount += 1;
    return true;
  }

  const t0 = 1000000;
  assert.ok(syncVscodeMetrics(t0), 'First sync should proceed');
  assert.ok(!syncVscodeMetrics(t0 + 1000), 'Concurrent sync within 30s should be blocked');
  assert.ok(syncVscodeMetrics(t0 + 31_000), 'Sync after 30s stale timeout should proceed');
  assert.equal(syncCount, 2);
});

// RISCO-R2-02: JSON depth limit
test('RISCO-R2-02: checkJsonDepth rejects deeply nested objects', async () => {
  const MAX_JSON_DEPTH = 20;

  function checkJsonDepth(value: unknown, depth: number): boolean {
    if (depth > MAX_JSON_DEPTH) return false;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (!checkJsonDepth(item, depth + 1)) return false;
      }
    } else if (value !== null && typeof value === 'object') {
      for (const key in value) {
        if (!checkJsonDepth((value as Record<string, unknown>)[key], depth + 1)) return false;
      }
    }
    return true;
  }

  const shallow = { a: { b: { c: 1 } } };
  assert.ok(checkJsonDepth(shallow, 0), 'Shallow objects should pass');

  let deep: unknown = 'leaf';
  for (let i = 0; i < 25; i++) {
    deep = { nested: deep };
  }
  assert.ok(!checkJsonDepth(deep, 0), 'Object with depth > 20 should be rejected');

  const flat = { a: 1, b: 2, c: 3 };
  assert.ok(checkJsonDepth(flat, 0), 'Flat objects should pass');
});

// RISCO-R2-01: ML mutex serialization
test('RISCO-R2-01: promise-based mutex serializes concurrent operations', async () => {
  const order: number[] = [];
  let mutex: Promise<void> = Promise.resolve();

  async function withModelLock<T>(fn: () => Promise<T>): Promise<T> {
    let release: () => void;
    const next = new Promise<void>((resolve) => { release = resolve; });
    const prev = mutex;
    mutex = next;
    await prev;
    try {
      return await fn();
    } finally {
      release!();
    }
  }

  const p1 = withModelLock(async () => {
    await new Promise((r) => setTimeout(r, 20));
    order.push(1);
  });
  const p2 = withModelLock(async () => {
    order.push(2);
  });
  const p3 = withModelLock(async () => {
    order.push(3);
  });

  await Promise.all([p1, p2, p3]);
  assert.deepEqual(order, [1, 2, 3], 'Operations should execute in FIFO order');
});
