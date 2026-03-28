const PREFIX = 'smrt_';

export function get<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (raw === null) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function set<T>(key: string, value: T): void {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Storage quota exceeded or private mode — silently ignore
  }
}

export function remove(key: string): void {
  localStorage.removeItem(PREFIX + key);
}
