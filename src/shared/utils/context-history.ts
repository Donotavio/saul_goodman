import {
  type ContextHistory,
  type ContextSegment,
  type ContextModeState,
  type ContextModeValue,
  type DailyMetrics
} from '../types.js';

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
  indices: Record<ContextModeValue, number | undefined>;
}

/**
 * Parâmetros para cálculo do contexto consolidado.
 */
export interface ContextBreakdownParams {
  history?: ContextHistory;
  metrics: DailyMetrics;
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
export function closeOpenContextSegment(
  history: ContextHistory,
  timestamp: number,
  index?: number
): ContextHistory {
  if (!history.length) {
    return history;
  }
  const last = history[history.length - 1];
  if (typeof last.end === 'number') {
    return history;
  }
  last.end = Math.max(timestamp, last.start);
  const normalizedIndex = normalizeIndexValue(index);
  if (normalizedIndex !== null) {
    last.index = normalizedIndex;
  }
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
  timestamp: number,
  index?: number
): ContextHistory {
  const entry: ContextSegment = { value, start: timestamp };
  const normalizedIndex = normalizeIndexValue(index);
  if (normalizedIndex !== null) {
    entry.index = normalizedIndex;
  }
  history.push(entry);
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
 * Calcula os tempos e índices registrados por contexto.
 * @param params Informações necessárias para consolidar histórico e índice atual.
 * @returns Tempos acumulados e índices por contexto.
 */
export function buildContextBreakdown(params: ContextBreakdownParams): ContextBreakdownResult {
  const now = params.now ?? Date.now();
  const durations = aggregateContextDurations(params.history, now);
  const indices = CONTEXT_VALUES.reduce((acc, value) => {
    acc[value] = undefined;
    return acc;
  }, {} as Record<ContextModeValue, number | undefined>);

  const history = params.history;
  if (!history?.length) {
    return { durations, indices };
  }

  const lastByContext = CONTEXT_VALUES.reduce((acc, value) => {
    acc[value] = undefined;
    return acc;
  }, {} as Record<ContextModeValue, ContextSegment | undefined>);

  for (const segment of history) {
    lastByContext[segment.value] = segment;
  }

  const activeContext = resolveActiveContext(history);
  const currentIndex = normalizeIndexValue(params.metrics.currentIndex);

  for (const value of CONTEXT_VALUES) {
    const segment = lastByContext[value];
    if (!segment) {
      continue;
    }
    if (value === activeContext && currentIndex !== null) {
      indices[value] = currentIndex;
      continue;
    }
    const recordedIndex = normalizeIndexValue(segment.index);
    indices[value] = recordedIndex ?? undefined;
  }

  return { durations, indices };
}

function normalizeIndexValue(value?: number): number | null {
  if (typeof value !== 'number' || Number.isNaN(value) || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(100, Math.max(0, Math.round(value)));
}

function resolveActiveContext(history: ContextHistory): ContextModeValue | null {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const segment = history[i];
    if (typeof segment.end !== 'number') {
      return segment.value;
    }
  }
  return history[history.length - 1]?.value ?? null;
}
