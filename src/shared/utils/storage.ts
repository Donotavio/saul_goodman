export enum LocalStorageKey {
  MANUAL_OVERRIDE = 'sg:manual-override',
  CONTEXT_MODE = 'sg:context-mode',
  HOLIDAYS_CACHE = 'sg:holidays-cache',
  CONTEXT_HISTORY = 'sg:context-history'
}

/**
 * Wraps `chrome.storage.local.set()` with QuotaExceededError handling.
 * Returns `true` on success, `false` on failure (e.g. quota exceeded).
 */
export async function safeStorageSet(data: Record<string, unknown>): Promise<boolean> {
  try {
    await chrome.storage.local.set(data);
    return true;
  } catch (error) {
    console.warn('[saul-goodman] storage write failed:', error);
    return false;
  }
}

export async function readLocalStorage<T>(key: LocalStorageKey): Promise<T | undefined> {
  const stored = await chrome.storage.local.get(key);
  return (stored?.[key] as T | undefined) ?? undefined;
}

export async function writeLocalStorage<T>(key: LocalStorageKey, value: T | undefined): Promise<void> {
  if (typeof value === 'undefined') {
    await chrome.storage.local.remove(key);
    return;
  }
  await safeStorageSet({ [key]: value });
}
