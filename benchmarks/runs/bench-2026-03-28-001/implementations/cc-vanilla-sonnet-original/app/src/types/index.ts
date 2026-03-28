export type TransportMode = 'train' | 'metro' | 'tram' | 'ferry' | 'bus';

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  modes: TransportMode[];
}

export interface RouteLeg {
  id: string;
  originStopId: string;
  destinationStopId: string;
  mode: TransportMode;
}

export interface SavedRoute {
  id: string;
  name: string;
  legs: RouteLeg[];
  createdAt: number;
}

export interface DepartureEvent {
  departureId: string;
  stopId: string;
  plannedDepartureISO: string;
  realtimeDepartureISO: string | null;
  isDelayed: boolean;
  delayMinutes: number;
  headsign: string;
  lineNumber: string;
  mode: TransportMode;
}

export interface TripLeg {
  routeLeg: RouteLeg;
  departure: DepartureEvent;
  arrivalISO: string;
  transferMinutesToNext: number | null;
  transferAtRisk: boolean;
}

export interface TripOption {
  legs: TripLeg[];
  totalDurationMinutes: number;
  arrivalISO: string;
  feasible: boolean;
}

export interface ServiceAdvisory {
  id: string;
  header: string;
  description: string;
  effect: string;
  affectedStopIds: string[];
  affectedRouteIds: string[];
  activePeriodStart: number;
  activePeriodEnd: number | null;
}

export interface WeatherCurrent {
  tempC: number;
  feelsLikeC: number;
  windKph: number;
  weatherCode: number;
  isDay: boolean;
}

export interface WeatherForecastDay {
  date: string;
  highC: number;
  lowC: number;
  weatherCode: number;
  precipitationProbability: number;
}

export interface BehaviorEntry {
  routeId: string;
  checkedAt: number;
  dayOfWeek: number;
}

export interface BehaviorPattern {
  routeId: string;
  typicalDepartureHour: number;
  typicalDepartureMinute: number;
  confidence: number;
}

export interface AppState {
  stops: Stop[];
  stopsLoaded: boolean;
  savedRoutes: SavedRoute[];
  activeRouteId: string | null;
  tripOptions: TripOption[];
  advisories: ServiceAdvisory[];
  weatherCurrent: WeatherCurrent | null;
  weatherForecast: WeatherForecastDay[];
  behaviorLog: BehaviorEntry[];
  behaviorPatterns: BehaviorPattern[];
  userLat: number | null;
  userLon: number | null;
  lastRefreshedAt: number | null;
  isRefreshing: boolean;
  apiKey: string;
}
