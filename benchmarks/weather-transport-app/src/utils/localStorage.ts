import type { SavedLocation, SavedStop } from '../types';

export function loadLocation(): SavedLocation | null {
  try {
    const raw = localStorage.getItem('wt_location');
    if (!raw) return null;
    return JSON.parse(raw) as SavedLocation;
  } catch {
    localStorage.removeItem('wt_location');
    return null;
  }
}

export function saveLocation(location: SavedLocation): void {
  localStorage.setItem('wt_location', JSON.stringify(location));
}

export function loadStop(): SavedStop | null {
  try {
    const raw = localStorage.getItem('wt_stop');
    if (!raw) return null;
    return JSON.parse(raw) as SavedStop;
  } catch {
    localStorage.removeItem('wt_stop');
    return null;
  }
}

export function saveStop(stop: SavedStop): void {
  localStorage.setItem('wt_stop', JSON.stringify(stop));
}
