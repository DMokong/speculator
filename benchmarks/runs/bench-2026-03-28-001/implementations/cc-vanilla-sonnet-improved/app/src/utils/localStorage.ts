import type { SavedLocation, SavedStop } from '../types';

const LOCATION_KEY = 'wt_location';
const STOP_KEY = 'wt_stop';

export function getLocation(): SavedLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_KEY);
    return raw ? (JSON.parse(raw) as SavedLocation) : null;
  } catch {
    return null;
  }
}

export function setLocation(loc: SavedLocation): void {
  localStorage.setItem(LOCATION_KEY, JSON.stringify(loc));
}

export function getStop(): SavedStop | null {
  try {
    const raw = localStorage.getItem(STOP_KEY);
    return raw ? (JSON.parse(raw) as SavedStop) : null;
  } catch {
    return null;
  }
}

export function setStop(stop: SavedStop): void {
  localStorage.setItem(STOP_KEY, JSON.stringify(stop));
}
