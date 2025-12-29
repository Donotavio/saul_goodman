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
  if (score <= 25) {
    return 'popup_score_message_excellent';
  }
  if (score <= 50) {
    return 'popup_score_message_ok';
  }
  if (score <= 75) {
    return 'popup_score_message_warning';
  }
  return 'popup_score_message_alert';
}
