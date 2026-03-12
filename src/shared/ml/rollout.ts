export type MlVariant = 'v1' | 'v2';
export type MlRolloutStage = 'shadow' | 'ab10' | 'ab50' | 'full';

export interface BinaryConfusion {
  tp: number;
  fp: number;
  tn: number;
  fn: number;
}

export interface ShadowMetrics {
  explicitCount: number;
  v1: BinaryConfusion;
  v2: BinaryConfusion;
  lastUpdated: number;
}

export interface GateEvaluation {
  macroF1V1: number;
  macroF1V2: number;
  deltaMacroF1: number;
  precisionProductiveV1: number;
  precisionProductiveV2: number;
  precisionProcrastinationV1: number;
  precisionProcrastinationV2: number;
  precisionDropProductive: number;
  precisionDropProcrastination: number;
  passed: boolean;
}

export interface RolloutState {
  stage: MlRolloutStage;
  installBucket: number;
  shadowStartedAt: number;
  stageStartedAt: number;
  lastGateEvaluationAt: number;
}

export function createEmptyConfusion(): BinaryConfusion {
  return { tp: 0, fp: 0, tn: 0, fn: 0 };
}

export function createInitialRollout(now: number, installBucket: number): RolloutState {
  return {
    stage: 'shadow',
    installBucket: clampBucket(installBucket),
    shadowStartedAt: now,
    stageStartedAt: now,
    lastGateEvaluationAt: 0
  };
}

export function updateConfusion(
  confusion: BinaryConfusion,
  predicted: 0 | 1,
  actual: 0 | 1
): BinaryConfusion {
  const next = { ...confusion };
  if (predicted === 1 && actual === 1) next.tp += 1;
  if (predicted === 1 && actual === 0) next.fp += 1;
  if (predicted === 0 && actual === 0) next.tn += 1;
  if (predicted === 0 && actual === 1) next.fn += 1;
  return next;
}

export function evaluateGate(metrics: ShadowMetrics): GateEvaluation {
  const macroF1V1 = calculateMacroF1(metrics.v1);
  const macroF1V2 = calculateMacroF1(metrics.v2);

  const precisionProductiveV1 = safeDivide(metrics.v1.tp, metrics.v1.tp + metrics.v1.fp);
  const precisionProductiveV2 = safeDivide(metrics.v2.tp, metrics.v2.tp + metrics.v2.fp);

  const precisionProcrastinationV1 = safeDivide(metrics.v1.tn, metrics.v1.tn + metrics.v1.fn);
  const precisionProcrastinationV2 = safeDivide(metrics.v2.tn, metrics.v2.tn + metrics.v2.fn);

  const precisionDropProductive = precisionProductiveV2 - precisionProductiveV1;
  const precisionDropProcrastination = precisionProcrastinationV2 - precisionProcrastinationV1;
  const deltaMacroF1 = macroF1V2 - macroF1V1;
  const passed = deltaMacroF1 >= 0.05 &&
    precisionDropProductive >= -0.03 &&
    precisionDropProcrastination >= -0.03;

  return {
    macroF1V1,
    macroF1V2,
    deltaMacroF1,
    precisionProductiveV1,
    precisionProductiveV2,
    precisionProcrastinationV1,
    precisionProcrastinationV2,
    precisionDropProductive,
    precisionDropProcrastination,
    passed
  };
}

export function resolveVariantByRollout(state: RolloutState): MlVariant {
  switch (state.stage) {
    case 'shadow':
      return 'v1';
    case 'ab10':
      return state.installBucket < 10 ? 'v2' : 'v1';
    case 'ab50':
      return state.installBucket < 50 ? 'v2' : 'v1';
    case 'full':
    default:
      return 'v2';
  }
}

export function maybePromoteRollout(
  state: RolloutState,
  metrics: ShadowMetrics,
  now: number
): { state: RolloutState; gate: GateEvaluation } {
  const gate = evaluateGate(metrics);
  let next = { ...state, lastGateEvaluationAt: now };
  const shadowElapsed = now - state.shadowStartedAt;
  const stageElapsed = now - state.stageStartedAt;
  const meetsShadowWindow = shadowElapsed >= 14 * 24 * 60 * 60 * 1000 || metrics.explicitCount >= 400;

  if (state.stage === 'shadow' && meetsShadowWindow && gate.passed) {
    next = { ...next, stage: 'ab10', stageStartedAt: now };
  } else if (state.stage === 'ab10' && stageElapsed >= 7 * 24 * 60 * 60 * 1000 && gate.passed) {
    next = { ...next, stage: 'ab50', stageStartedAt: now };
  } else if (state.stage === 'ab50' && stageElapsed >= 7 * 24 * 60 * 60 * 1000 && gate.passed) {
    next = { ...next, stage: 'full', stageStartedAt: now };
  }

  return { state: next, gate };
}

export function calculateMacroF1(confusion: BinaryConfusion): number {
  const precisionPositive = safeDivide(confusion.tp, confusion.tp + confusion.fp);
  const recallPositive = safeDivide(confusion.tp, confusion.tp + confusion.fn);
  const f1Positive = f1(precisionPositive, recallPositive);

  const precisionNegative = safeDivide(confusion.tn, confusion.tn + confusion.fn);
  const recallNegative = safeDivide(confusion.tn, confusion.tn + confusion.fp);
  const f1Negative = f1(precisionNegative, recallNegative);
  return (f1Positive + f1Negative) / 2;
}

function f1(precision: number, recall: number): number {
  if (precision <= 0 || recall <= 0) {
    return 0;
  }
  return (2 * precision * recall) / (precision + recall);
}

function safeDivide(numerator: number, denominator: number): number {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) {
    return 0;
  }
  return numerator / denominator;
}

function clampBucket(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(99, Math.floor(value)));
}
