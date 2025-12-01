import { DailyMetrics, ExtensionSettings } from './types.js';

const MAX_TAB_SWITCHES = 50;
const MAX_INACTIVE_MS = 3 * 60 * 60 * 1000; // 3h baseline

export function calculateProcrastinationIndex(
  metrics: DailyMetrics,
  settings: ExtensionSettings
): number {
  const overtimeBonus = metrics.overtimeProductiveMs ?? 0;
  const effectiveProductive = metrics.productiveMs + overtimeBonus;
  const totalTracked = effectiveProductive + metrics.procrastinationMs;
  const procrastinationRatio = totalTracked === 0 ? 0 : metrics.procrastinationMs / totalTracked;
  const tabSwitchRatio = Math.min(metrics.tabSwitches / MAX_TAB_SWITCHES, 1);
  const inactivityRatio = Math.min(metrics.inactiveMs / MAX_INACTIVE_MS, 1);

  const { procrastinationWeight, tabSwitchWeight, inactivityWeight } = settings.weights;

  const weightedScore =
    procrastinationRatio * procrastinationWeight +
    tabSwitchRatio * tabSwitchWeight +
    inactivityRatio * inactivityWeight;

  return Math.min(Math.round(weightedScore * 100), 100);
}
