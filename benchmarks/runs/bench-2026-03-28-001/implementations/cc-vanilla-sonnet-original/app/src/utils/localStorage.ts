import type { SavedLocation, SavedStop } from '../types'

const LOCATION_KEY = 'wt_location'
const STOP_KEY = 'wt_stop'

export function getLocation(): SavedLocation | null {
  try {
    const raw = localStorage.getItem(LOCATION_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SavedLocation
  } catch {
    return null
  }
}

export function setLocation(loc: SavedLocation): void {
  try {
    localStorage.setItem(LOCATION_KEY, JSON.stringify(loc))
  } catch {
    // private browsing or quota exceeded — silently ignore
  }
}

export function getStop(): SavedStop | null {
  try {
    const raw = localStorage.getItem(STOP_KEY)
    if (!raw) return null
    return JSON.parse(raw) as SavedStop
  } catch {
    return null
  }
}

export function setStop(stop: SavedStop): void {
  try {
    localStorage.setItem(STOP_KEY, JSON.stringify(stop))
  } catch {
    // private browsing or quota exceeded — silently ignore
  }
}
