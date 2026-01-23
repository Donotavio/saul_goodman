import {
  ContextModeState,
  DailyMetrics,
  ExtensionSettings,
  FairnessRule,
  ManualOverrideState
} from './types.js';
import { resolveContextImpact } from './utils/context.js';
import { isManualOverrideActive } from './utils/manual-override.js';

const MAX_TAB_SWITCHES = 50;
const MAX_INACTIVE_MS = 3 * 60 * 60 * 1000; // 3h baseline

export const SCORE_MESSAGE_THRESHOLDS = {
  excellentMax: 25,
  okMax: 50,
  warningMax: 75
} as const;

export type ScoreMessageBand = 'excellent' | 'ok' | 'warning' | 'alert';
export type ScoreBand = 'good' | 'warn' | 'alert' | 'neutral';

export interface ScoreGuards {
  manualOverride?: ManualOverrideState;
  contextMode?: ContextModeState;
  holidayNeutral?: boolean;
}

export interface ScoreComputation {
  score: number;
  rule: FairnessRule;
  manualOverrideActive: boolean;
  contextMode: ContextModeState;
  holidayNeutral: boolean;
}

export function calculateProcrastinationIndex(
  metrics: DailyMetrics,
  settings: ExtensionSettings,
  guards?: ScoreGuards
): ScoreComputation {
  const guardManualOverride = guards?.manualOverride;
  const manualOverrideActive = isManualOverrideActive(guardManualOverride, metrics.dateKey);
  const contextState: ContextModeState =
    guards?.contextMode ?? ({ value: 'work', updatedAt: Date.now() } as ContextModeState);
  const contextImpact = resolveContextImpact(contextState.value);
  const holidayNeutral = Boolean(guards?.holidayNeutral);

  if (manualOverrideActive) {
    return {
      score: 0,
      rule: 'manual-override',
      manualOverrideActive: true,
      contextMode: contextState,
      holidayNeutral
    };
  }

  if (contextImpact.neutralize) {
    return {
      score: 0,
      rule: contextImpact.rule,
      manualOverrideActive: false,
      contextMode: contextState,
      holidayNeutral
    };
  }

  const overtimeBonus = metrics.overtimeProductiveMs ?? 0;
  const vscodeMs = metrics.vscodeActiveMs ?? 0;
  const productiveBase = metrics.productiveMs + vscodeMs + overtimeBonus;
  const procrastinationBase = metrics.procrastinationMs;
  const effectiveProductive = productiveBase * contextImpact.productiveMultiplier;
  const effectiveProcrastination = procrastinationBase * contextImpact.procrastinationMultiplier;
  const totalTracked = effectiveProductive + effectiveProcrastination;
  const procrastinationRatio =
    totalTracked === 0 ? 0 : effectiveProcrastination / Math.max(totalTracked, 1);
  const tabSwitchRatio = Math.min(metrics.tabSwitches / MAX_TAB_SWITCHES, 1);
  const inactivityRatio = Math.min(metrics.inactiveMs / MAX_INACTIVE_MS, 1);

  const { procrastinationWeight, tabSwitchWeight, inactivityWeight } = settings.weights;

  const weightedScore =
    procrastinationRatio * procrastinationWeight +
    tabSwitchRatio * tabSwitchWeight +
    inactivityRatio * inactivityWeight;

  const finalScore = Math.min(Math.round(weightedScore * 100), 100);

  if (holidayNeutral) {
    return {
      score: 0,
      rule: 'holiday',
      manualOverrideActive: false,
      contextMode: contextState,
      holidayNeutral: true
    };
  }

  return {
    score: finalScore,
    rule: contextImpact.rule,
    manualOverrideActive: false,
    contextMode: contextState,
    holidayNeutral: false
  };
}

export function pickScoreMessageKey(score: number): string {
  const band = getScoreMessageBand(score);
  switch (band) {
    case 'excellent':
      return 'popup_score_message_excellent';
    case 'ok':
      return 'popup_score_message_ok';
    case 'warning':
      return 'popup_score_message_warning';
    case 'alert':
    default:
      return 'popup_score_message_alert';
  }
}

export function getScoreMessageBand(score: number): ScoreMessageBand {
  if (score <= SCORE_MESSAGE_THRESHOLDS.excellentMax) {
    return 'excellent';
  }
  if (score <= SCORE_MESSAGE_THRESHOLDS.okMax) {
    return 'ok';
  }
  if (score <= SCORE_MESSAGE_THRESHOLDS.warningMax) {
    return 'warning';
  }
  return 'alert';
}

export function getScoreBand(score: number): ScoreBand {
  if (!Number.isFinite(score)) {
    return 'neutral';
  }
  if (score <= SCORE_MESSAGE_THRESHOLDS.excellentMax) {
    return 'good';
  }
  if (score <= SCORE_MESSAGE_THRESHOLDS.warningMax) {
    return 'warn';
  }
  return 'alert';
}
