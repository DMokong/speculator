import type { SavedRoute, BehaviourRecord, UserPreferences } from '../types';

const KEYS = {
  routes: 'sc_routes',
  behaviour: 'sc_behaviour',
  prefs: 'sc_prefs',
} as const;

function getItem<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return defaultValue;
    return JSON.parse(raw) as T;
  } catch {
    localStorage.removeItem(key);
    return defaultValue;
  }
}

function setItem<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value));
}

export function getRoutes(): SavedRoute[] {
  return getItem<SavedRoute[]>(KEYS.routes, []);
}

export function setRoutes(routes: SavedRoute[]): void {
  setItem(KEYS.routes, routes);
}

export function getBehaviourRecords(): BehaviourRecord[] {
  return getItem<BehaviourRecord[]>(KEYS.behaviour, []);
}

export function setBehaviourRecords(records: BehaviourRecord[]): void {
  const trimmed = records.slice(-500);
  setItem(KEYS.behaviour, trimmed);
}

export function getPrefs(): UserPreferences {
  return getItem<UserPreferences>(KEYS.prefs, {
    notificationsEnabled: false,
    lastNotificationTime: null,
  });
}

export function setPrefs(prefs: UserPreferences): void {
  setItem(KEYS.prefs, prefs);
}
