import type { ManualOverrideState } from '../types.js';
import { getTodayKey } from './time.js';
import { LocalStorageKey, readLocalStorage, writeLocalStorage } from './storage.js';

const DEFAULT_MANUAL_OVERRIDE: ManualOverrideState = {
  enabled: false,
  date: ''
};

export async function getManualOverrideState(): Promise<ManualOverrideState> {
  const stored = (await readLocalStorage<ManualOverrideState>(LocalStorageKey.MANUAL_OVERRIDE)) ?? DEFAULT_MANUAL_OVERRIDE;
  const today = getTodayKey();
  if (!stored.enabled) {
    if (stored.date !== today) {
      return { enabled: false, date: today };
    }
    return stored;
  }
  if (stored.date !== today) {
    const refreshed: ManualOverrideState = { enabled: false, date: today };
    await writeLocalStorage(LocalStorageKey.MANUAL_OVERRIDE, refreshed);
    return refreshed;
  }
  return stored;
}

export async function setManualOverride(enabled: boolean, date?: string): Promise<ManualOverrideState> {
  const targetDate = date ?? getTodayKey();
  const next: ManualOverrideState = { enabled, date: targetDate };
  await writeLocalStorage(LocalStorageKey.MANUAL_OVERRIDE, next);
  return next;
}

export async function clearManualOverride(): Promise<void> {
  await writeLocalStorage(LocalStorageKey.MANUAL_OVERRIDE, { enabled: false, date: getTodayKey() });
}

export function isManualOverrideActive(state: ManualOverrideState | null | undefined, dateKey?: string): boolean {
  if (!state?.enabled) {
    return false;
  }
  const reference = dateKey ?? getTodayKey();
  return state.date === reference;
}
