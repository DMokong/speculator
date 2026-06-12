export type TransportMode = 'train' | 'metro' | 'tram' | 'ferry';

export interface Stop {
  id: string;
  name: string;
  lat: number;
  lon: number;
  modes: TransportMode[];
}

export interface RouteLeg {
  id: string;
  origin: Stop;
  destination: Stop;
  mode: TransportMode;
}

export interface SavedRoute {
  id: string;
  name: string;
  legs: RouteLeg[];
  createdAt: number;
}

export interface DepartureEvent {
  stopId: string;
  line: string;
  destination: string;
  plannedDeparture: Date;
  estimatedDeparture: Date | null;
  isRealtime: boolean;
  mode: TransportMode;
}

export interface TripLeg {
  legIndex: number;
  origin: Stop;
  destination: Stop;
  mode: TransportMode;
  plannedDeparture: Date;
  estimatedDeparture: Date | null;
  plannedArrival: Date;
  estimatedArrival: Date | null;
  line: string;
}

export interface FeasibleTrip {
  legs: TripLeg[];
  transferGaps: number[];
  totalDuration: number;
}

export interface ServiceAlert {
  id: string;
  header: string;
  description: string;
  affectedStopIds: string[];
  affectedRouteIds: string[];
  mode: TransportMode;
  activePeriodStart: number;
  activePeriodEnd: number | null;
}

export interface WeatherCurrent {
  temperatureC: number;
  feelsLikeC: number;
  windSpeedKmh: number;
  weatherCode: number;
  precipitationProbability: number;
}

export interface WeatherDay {
  date: string;
  maxC: number;
  minC: number;
  weatherCode: number;
  precipProbability: number;
}

export interface BehaviourRecord {
  routeId: string;
  checkedAt: number;
  dayOfWeek: number;
}

export interface UserPreferences {
  notificationsEnabled: boolean;
  lastNotificationTime: number | null;
}
