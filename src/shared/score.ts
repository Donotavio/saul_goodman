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

export function pickScoreMessage(score: number): string {
  if (score <= 25) {
    return 'Cliente de ouro! Continue assim que eu consigo cobrar cache cheio.';
  }
  if (score <= 50) {
    return 'Ainda dá pra dizer que é expediente. Não me force a ligar pro seu foco.';
  }
  if (score <= 75) {
    return 'Vejo sinais de fuga de responsabilidade. Hora de voltar pro jogo.';
  }
  return 'Você está brincando com fogo. E eu cobro por hora para apagar incêndios.';
}
