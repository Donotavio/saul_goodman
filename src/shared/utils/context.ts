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
  }
};

export const CONTEXT_MODE_OPTIONS: Array<{ value: ContextModeValue; labelKey: string }> = [
  { value: 'work', labelKey: 'popup_context_option_work' },
  { value: 'personal', labelKey: 'popup_context_option_personal' },
  { value: 'leisure', labelKey: 'popup_context_option_leisure' },
  { value: 'study', labelKey: 'popup_context_option_study' }
];

export async function getContextMode(): Promise<ContextModeState> {
  const stored =
    (await readLocalStorage<ContextModeState>(LocalStorageKey.CONTEXT_MODE)) ??
    DEFAULT_CONTEXT_STATE;
  if (!stored?.value) {
    return { ...DEFAULT_CONTEXT_STATE, updatedAt: Date.now() };
  }
  return stored;
}

export async function setContextMode(value: ContextModeValue): Promise<ContextModeState> {
  const next: ContextModeState = { value, updatedAt: Date.now() };
  await writeLocalStorage(LocalStorageKey.CONTEXT_MODE, next);
  return next;
}

export function resolveContextImpact(value: ContextModeValue): ContextImpact {
  return CONTEXT_IMPACTS[value] ?? CONTEXT_IMPACTS.work;
}
