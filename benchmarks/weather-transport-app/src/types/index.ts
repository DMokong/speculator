export interface SavedLocation {
  name: string;
  lat: number;
  lon: number;
}

export interface SavedStop {
  id: string;
  name: string;
  modes: number[];
}

export interface PanelError {
  kind: 'auth' | 'network' | 'unknown';
  message: string;
}

export interface PanelState<T> {
  status: 'idle' | 'loading' | 'success' | 'error';
  data: T | null;
  error: PanelError | null;
  lastUpdatedAt: number | null;
}

export interface WeatherCurrent {
  temperature_2m: number;
  apparent_temperature: number;
  windspeed_10m: number;
  weathercode: number;
}

export interface WeatherDaily {
  time: string[];
  weathercode: number[];
  temperature_2m_max: number[];
  temperature_2m_min: number[];
}

export interface WeatherData {
  current: WeatherCurrent;
  daily: WeatherDaily;
}

export interface Departure {
  mode: number;
  routeNumber: string;
  destination: string;
  departureTimePlanned: string;
  departureTimeEstimated: string | null;
}

export interface TransportData {
  departures: Departure[];
}

export interface AppState {
  location: SavedLocation | null;
  stop: SavedStop | null;
  weather: PanelState<WeatherData>;
  transport: PanelState<TransportData>;
  settingsOpen: boolean;
}
