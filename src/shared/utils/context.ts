import type { ContextModeState, ContextModeValue, FairnessRule } from '../types.js';
import { LocalStorageKey, readLocalStorage, writeLocalStorage } from './storage.js';

export interface ContextImpact {
  productiveMultiplier: number;
  procrastinationMultiplier: number;
  neutralize: boolean;
  rule: FairnessRule;
}

const DEFAULT_CONTEXT_STATE: ContextModeState = {
  value: 'work',
  updatedAt: Date.now()
};

const CONTEXT_IMPACTS: Record<ContextModeValue, ContextImpact> = {
  work: {
    productiveMultiplier: 1,
    procrastinationMultiplier: 1,
    neutralize: false,
    rule: 'normal'
  },
  personal: {
    productiveMultiplier: 0,
    procrastinationMultiplier: 0,
    neutralize: true,
    rule: 'context-personal'
  },
  leisure: {
    productiveMultiplier: 0.3,
    procrastinationMultiplier: 0,
    neutralize: false,
    rule: 'context-leisure'
  },
  study: {
    productiveMultiplier: 0.75,
    procrastinationMultiplier: 0.5,
    neutralize: false,
    rule: 'context-study'
  },
  dayOff: {
    productiveMultiplier: 0,
    procrastinationMultiplier: 0,
    neutralize: true,
    rule: 'context-day-off'
  },
  vacation: {
    productiveMultiplier: 0,
    procrastinationMultiplier: 0,
    neutralize: true,
    rule: 'context-vacation'
  }
};

export const CONTEXT_MODE_OPTIONS: Array<{ value: ContextModeValue; labelKey: string }> = [
  { value: 'work', labelKey: 'popup_context_option_work' },
  { value: 'personal', labelKey: 'popup_context_option_personal' },
  { value: 'leisure', labelKey: 'popup_context_option_leisure' },
  { value: 'study', labelKey: 'popup_context_option_study' },
  { value: 'dayOff', labelKey: 'popup_context_option_dayOff' },
  { value: 'vacation', labelKey: 'popup_context_option_vacation' }
];

/**
 * Reads the persisted context mode or falls back to "work".
 * @returns The stored {@link ContextModeState} including the last updated timestamp.
 */
export async function getContextMode(): Promise<ContextModeState> {
  const stored =
    (await readLocalStorage<ContextModeState>(LocalStorageKey.CONTEXT_MODE)) ??
    DEFAULT_CONTEXT_STATE;
  if (!stored?.value) {
    return { ...DEFAULT_CONTEXT_STATE, updatedAt: Date.now() };
  }
  return stored;
}

/**
 * Persists the selected context mode value and timestamp.
 * @param value Context choice provided by the user.
 * @returns The saved context state, useful for optimistic UI updates.
 */
export async function setContextMode(value: ContextModeValue): Promise<ContextModeState> {
  const next: ContextModeState = { value, updatedAt: Date.now() };
  await writeLocalStorage(LocalStorageKey.CONTEXT_MODE, next);
  return next;
}

/**
 * Maps a context value to its scoring multipliers and fairness rule.
 * @param value Context value coming from the popup selector.
 * @returns Multiplier config that calculateProcrastinationIndex can apply.
 */
export function resolveContextImpact(value: ContextModeValue): ContextImpact {
  return CONTEXT_IMPACTS[value] ?? CONTEXT_IMPACTS.work;
}
