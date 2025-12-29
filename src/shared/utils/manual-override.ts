import type { ManualOverrideState } from '../types.js';
import { getTodayKey } from './time.js';
import { LocalStorageKey, readLocalStorage, writeLocalStorage } from './storage.js';

const DEFAULT_MANUAL_OVERRIDE: ManualOverrideState = {
  enabled: false,
  date: ''
};

/**
 * Reads the manual override state and resets it if it belongs to a previous day.
 * Ensures the stored date aligns with {@link getTodayKey}.
 */
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

/**
 * Persists the manual override choice.
 * @param enabled Whether the override should neutralize scoring.
 * @param date Optional date key (defaults to today) for testing or retroactive toggles.
 */
export async function setManualOverride(enabled: boolean, date?: string): Promise<ManualOverrideState> {
  const targetDate = date ?? getTodayKey();
  const next: ManualOverrideState = { enabled, date: targetDate };
  await writeLocalStorage(LocalStorageKey.MANUAL_OVERRIDE, next);
  return next;
}

/**
 * Clears the override and stamps today's date for future comparisons.
 */
export async function clearManualOverride(): Promise<void> {
  await writeLocalStorage(LocalStorageKey.MANUAL_OVERRIDE, { enabled: false, date: getTodayKey() });
}

/**
 * Checks if the override is active for the provided date (defaults to today).
 * @param state Stored manual override settings.
 * @param dateKey Optional comparison date.
 */
export function isManualOverrideActive(state: ManualOverrideState | null | undefined, dateKey?: string): boolean {
  if (!state?.enabled) {
    return false;
  }
  const reference = dateKey ?? getTodayKey();
  return state.date === reference;
}
