import { calculateProcrastinationIndex, type ScoreGuards } from '../score.js';
import {
  type ContextHistory,
  type ContextModeState,
  type ContextModeValue,
  type DailyMetrics,
  type ExtensionSettings
} from '../types.js';
import { resolveContextImpact } from './context.js';

export const CONTEXT_VALUES: ContextModeValue[] = [
  'work',
  'personal',
  'leisure',
  'study',
  'dayOff',
  'vacation'
];

/**
 * Resultado consolidado do histórico de contexto.
 */
export interface ContextBreakdownResult {
  durations: Record<ContextModeValue, number>;
  indices: Record<ContextModeValue, number>;
}

/**
 * Parâmetros para cálculo do contexto consolidado.
 */
export interface ContextBreakdownParams {
  history?: ContextHistory;
  metrics: DailyMetrics;
  settings: ExtensionSettings;
  now?: number;
}

/**
 * Garante que exista um segmento aberto correspondente ao contexto atual.
 * @param history Histórico pré-existente, normalmente vindo do armazenamento local.
 * @param context Contexto ativo informado pelo usuário.
 * @param timestamp Momento utilizado como início do segmento aberto.
 * @returns Histórico normalizado com ao menos um segmento aberto.
 */
export function ensureContextHistoryInitialized(
  history: ContextHistory | undefined,
  context: ContextModeState,
  timestamp: number
): ContextHistory {
  const normalized = Array.isArray(history) ? [...history] : [];
  if (!normalized.length || typeof normalized[normalized.length - 1]?.end === 'number') {
    normalized.push({ value: context.value, start: timestamp });
  }
  return normalized;
}

/**
 * Finaliza o segmento atual definindo seu tempo de término.
 * @param history Histórico diário de contexto.
 * @param timestamp Momento usado para fechar o segmento aberto.
 * @returns O próprio histórico para encadeamento.
 */
export function closeOpenContextSegment(history: ContextHistory, timestamp: number): ContextHistory {
  if (!history.length) {
    return history;
  }
  const last = history[history.length - 1];
  if (typeof last.end === 'number') {
    return history;
  }
  last.end = Math.max(timestamp, last.start);
  return history;
}

/**
 * Inicia um novo segmento de contexto aberto.
 * @param history Histórico diário a ser atualizado.
 * @param value Contexto escolhido pelo usuário.
 * @param timestamp Momento considerado como início do segmento.
 * @returns O próprio histórico para encadeamento.
 */
export function startContextSegment(
  history: ContextHistory,
  value: ContextModeValue,
  timestamp: number
): ContextHistory {
  history.push({ value, start: timestamp });
  return history;
}

/**
 * Consolida o tempo acumulado por contexto.
 * @param history Lista ordenada de segmentos de contexto.
 * @param now Timestamp usado para fechar segmentos ainda abertos.
 * @returns Mapa de milissegundos gastos por contexto.
 */
export function aggregateContextDurations(
  history: ContextHistory | undefined,
  now: number
): Record<ContextModeValue, number> {
  const totals = CONTEXT_VALUES.reduce((acc, value) => {
    acc[value] = 0;
    return acc;
  }, {} as Record<ContextModeValue, number>);
  if (!history?.length) {
    return totals;
  }

  for (const segment of history) {
    const end = typeof segment.end === 'number' ? segment.end : now;
    const duration = Math.max(0, end - segment.start);
    totals[segment.value] = (totals[segment.value] ?? 0) + duration;
  }

  return totals;
}

/**
 * Calcula os tempos e índices hipotéticos por contexto.
 * @param params Informações necessárias para projetar o impacto de cada contexto.
 * @returns Tempos acumulados e índices por contexto.
 */
export function buildContextBreakdown(params: ContextBreakdownParams): ContextBreakdownResult {
  const now = params.now ?? Date.now();
  const durations = aggregateContextDurations(params.history, now);
  const indices = CONTEXT_VALUES.reduce((acc, value) => {
    acc[value] = 0;
    return acc;
  }, {} as Record<ContextModeValue, number>);

  for (const value of CONTEXT_VALUES) {
    const impact = resolveContextImpact(value);
    if (impact.neutralize) {
      indices[value] = 0;
      continue;
    }
    const guards: ScoreGuards = {
      contextMode: { value, updatedAt: now },
      manualOverride: undefined,
      holidayNeutral: false
    };
    indices[value] = calculateProcrastinationIndex(params.metrics, params.settings, guards).score;
  }

  return { durations, indices };
}
