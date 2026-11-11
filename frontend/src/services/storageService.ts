const STORAGE_KEYS = {
  accessToken: 'finora_v1_access_token',
  uiPreferences: 'finora_v1_ui_preferences',
} as const;

export type StorageKey = keyof typeof STORAGE_KEYS;

export interface LocalUiPreferences {
  defaultPeriod: '3M' | '6M' | '12M' | 'ALL';
  sidebarCollapsed: boolean;
}

export const DEFAULT_LOCAL_UI_PREFERENCES: LocalUiPreferences = {
  defaultPeriod: '6M',
  sidebarCollapsed: false,
};

export function readStorage<T>(key: StorageKey): T | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[key]);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeStorage<T>(key: StorageKey, value: T): boolean {
  try {
    window.localStorage.setItem(STORAGE_KEYS[key], JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key: StorageKey): void {
  try {
    window.localStorage.removeItem(STORAGE_KEYS[key]);
  } catch {
    // Ignore storage removal errors
  }
}

export function getAuthToken(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEYS.accessToken);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEYS.accessToken, token);
  } catch {
    // Ignore storage write errors
  }
}

export function clearAuthToken(): void {
  removeStorage('accessToken');
}

export function getLocalUiPreferences(): LocalUiPreferences {
  const stored = readStorage<Partial<LocalUiPreferences>>('uiPreferences');
  return {
    defaultPeriod: stored?.defaultPeriod ?? DEFAULT_LOCAL_UI_PREFERENCES.defaultPeriod,
    sidebarCollapsed:
      stored?.sidebarCollapsed ?? DEFAULT_LOCAL_UI_PREFERENCES.sidebarCollapsed,
  };
}

export function saveLocalUiPreferences(prefs: LocalUiPreferences): void {
  writeStorage('uiPreferences', prefs);
}
