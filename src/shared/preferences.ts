const PREF_STORE_KEY = '__saulFallbackPrefs__';

type FallbackStore = Record<string, boolean>;

declare const chrome: undefined | {
  storage?: {
    local?: {
      get: (keys: string | string[], callback: (items: Record<string, unknown>) => void) => void;
      set: (items: Record<string, unknown>, callback: () => void) => void;
    };
  };
};

export const CRITICAL_SOUND_PREFERENCE_KEY = 'sg:critical-sound';

function hasChromeStorage(): boolean {
  return typeof chrome !== 'undefined' && !!chrome?.storage?.local;
}

function getFallbackStore(): FallbackStore {
  const globalScope = globalThis as { [PREF_STORE_KEY]?: FallbackStore };
  if (!globalScope[PREF_STORE_KEY]) {
    globalScope[PREF_STORE_KEY] = {};
  }
  return globalScope[PREF_STORE_KEY] as FallbackStore;
}

export async function saveBooleanPreference(key: string, value: boolean): Promise<void> {
  if (hasChromeStorage()) {
    await new Promise<void>((resolve) => {
      try {
        chrome?.storage?.local?.set({ [key]: value }, () => resolve());
      } catch {
        resolve();
      }
    });
    return;
  }

  const store = getFallbackStore();
  store[key] = value;
}

export async function loadBooleanPreference(key: string): Promise<boolean | undefined> {
  if (hasChromeStorage()) {
    return new Promise<boolean | undefined>((resolve) => {
      try {
        chrome?.storage?.local?.get(key, (result) => {
          resolve(result?.[key] as boolean | undefined);
        });
      } catch {
        resolve(undefined);
      }
    });
  }

  const store = getFallbackStore();
  return store[key];
}
