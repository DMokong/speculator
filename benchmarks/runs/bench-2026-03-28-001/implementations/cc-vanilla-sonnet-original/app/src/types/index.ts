export interface SavedLocation {
  name: string
  lat: number
  lon: number
}

export interface SavedStop {
  id: string
  name: string
}

export interface WeatherData {
  current: {
    temperature: number
    feelsLike: number
    windSpeed: number
    weatherCode: number
  }
  daily: Array<{
    date: string         // ISO date string e.g. "2026-03-28"
    maxTemp: number
    minTemp: number
    weatherCode: number
  }>
}

export interface Departure {
  mode: number           // transportation.product.class: 1=train, 5=bus, 9=ferry, 4=lightrail, 7=coach
  routeNumber: string    // transportation.number
  destination: string    // transportation.destination.name
  plannedTime: string    // departureTimePlanned ISO string
  estimatedTime: string | null  // departureTimeEstimated ISO string or null
}

export interface AppState {
  location: SavedLocation | null
  stop: SavedStop | null
  weather: WeatherData | null
  departures: Departure[]
  weatherLoading: boolean
  transportLoading: boolean
  weatherError: string | null
  transportError: string | null
  lastUpdated: Date | null
  settingsOpen: boolean
}

export type AppAction =
  | { type: 'SET_LOCATION'; payload: SavedLocation }
  | { type: 'SET_STOP'; payload: SavedStop }
  | { type: 'SET_WEATHER'; payload: WeatherData }
  | { type: 'SET_DEPARTURES'; payload: Departure[] }
  | { type: 'SET_WEATHER_LOADING'; payload: boolean }
  | { type: 'SET_TRANSPORT_LOADING'; payload: boolean }
  | { type: 'SET_WEATHER_ERROR'; payload: string | null }
  | { type: 'SET_TRANSPORT_ERROR'; payload: string | null }
  | { type: 'SET_LAST_UPDATED'; payload: Date }
  | { type: 'TOGGLE_SETTINGS' }
  | { type: 'CLOSE_SETTINGS' }

export interface WeatherCodeInfo {
  label: string
  icon: string
}

export interface SuburbEntry {
  name: string
  lat: number
  lon: number
}
