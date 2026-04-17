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

const MAX_SUGGESTIONS_HISTORY = 500;
const MAX_VSCODE_TIMELINE = 2000;

/**
 * Trims metrics fields that can grow without bound to stay within
 * chrome.storage.local quota. Returns true if anything was pruned.
 */
export function pruneMetricsForQuota(metrics: Record<string, unknown>): boolean {
  let pruned = false;

  const history = metrics.suggestionsHistory;
  if (history && typeof history === 'object' && !Array.isArray(history)) {
    const keys = Object.keys(history as Record<string, unknown>);
    if (keys.length > MAX_SUGGESTIONS_HISTORY) {
      const entries = Object.entries(history as Record<string, unknown>);
      entries.sort((a, b) => {
        const tsA = (a[1] as { timestamp?: number })?.timestamp ?? 0;
        const tsB = (b[1] as { timestamp?: number })?.timestamp ?? 0;
        return tsB - tsA;
      });
      const trimmed = Object.fromEntries(entries.slice(0, MAX_SUGGESTIONS_HISTORY));
      (metrics as Record<string, unknown>).suggestionsHistory = trimmed;
      pruned = true;
    }
  }

  const vscodeTimeline = metrics.vscodeTimeline;
  if (Array.isArray(vscodeTimeline) && vscodeTimeline.length > MAX_VSCODE_TIMELINE) {
    (metrics as Record<string, unknown>).vscodeTimeline = vscodeTimeline.slice(-MAX_VSCODE_TIMELINE);
    pruned = true;
  }

  return pruned;
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
