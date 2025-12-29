export enum LocalStorageKey {
  MANUAL_OVERRIDE = 'sg:manual-override',
  CONTEXT_MODE = 'sg:context-mode',
  HOLIDAYS_CACHE = 'sg:holidays-cache',
  CONTEXT_HISTORY = 'sg:context-history'
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
  await chrome.storage.local.set({ [key]: value });
}
