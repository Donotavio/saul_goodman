const LOCALHOST_ORIGINS = ['http://127.0.0.1/*', 'http://localhost/*'];

function canUsePermissionsApi(): boolean {
  return Boolean(chrome?.permissions?.contains && chrome?.permissions?.request);
}

function normalizeOrigins(origins: string | string[]): string[] {
  return Array.isArray(origins) ? origins : [origins];
}

function permissionsContains(origins: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.permissions.contains({ origins }, (result) => resolve(Boolean(result)));
  });
}

function permissionsRequest(origins: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.permissions.request({ origins }, (result) => resolve(Boolean(result)));
  });
}

export async function hasHostPermission(origins: string | string[]): Promise<boolean> {
  if (!canUsePermissionsApi()) {
    return true;
  }
  return permissionsContains(normalizeOrigins(origins));
}

export async function hasAnyHostPermission(origins: string[]): Promise<boolean> {
  if (!canUsePermissionsApi()) {
    return true;
  }
  for (const origin of origins) {
    if (await permissionsContains([origin])) {
      return true;
    }
  }
  return false;
}

export async function ensureHostPermission(origins: string | string[]): Promise<boolean> {
  if (!canUsePermissionsApi()) {
    return true;
  }
  const normalized = normalizeOrigins(origins);
  if (await permissionsContains(normalized)) {
    return true;
  }
  return permissionsRequest(normalized);
}

export async function ensureLocalhostPermission(): Promise<boolean> {
  if (!canUsePermissionsApi()) {
    return true;
  }
  if (await hasAnyHostPermission(LOCALHOST_ORIGINS)) {
    return true;
  }
  return permissionsRequest(LOCALHOST_ORIGINS);
}

export async function hasLocalhostPermission(): Promise<boolean> {
  return hasAnyHostPermission(LOCALHOST_ORIGINS);
}

export function isLocalhostUrl(value: string): boolean {
  if (!value) {
    return false;
  }
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}
