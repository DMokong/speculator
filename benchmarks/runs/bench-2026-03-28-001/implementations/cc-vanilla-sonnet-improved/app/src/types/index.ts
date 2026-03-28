export type TransportMode = 'bus' | 'train' | 'ferry' | 'lightrail' | 'coach' | 'metro';

export interface SavedLocation {
  name: string;
  lat: number;
  lng: number;
}

export interface SavedStop {
  stopId: string;
  name: string;
  modes: TransportMode[];
}

export interface DailyForecast {
  date: string;       // ISO date "YYYY-MM-DD"
  tempMax: number;
  tempMin: number;
  weatherCode: number;
}

export interface WeatherData {
  current: {
    temp: number;
    feelsLike: number;
    windSpeed: number;
    weatherCode: number;
  };
  daily: DailyForecast[];
}

export interface Departure {
  mode: TransportMode;
  routeNumber: string;
  destination: string;
  scheduledDeparture: string;   // ISO 8601
  estimatedDeparture: string | null;
  isDelayed: boolean;
}
