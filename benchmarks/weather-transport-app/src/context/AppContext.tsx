import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import type {
  AppState,
  SavedLocation,
  SavedStop,
  WeatherData,
  TransportData,
  PanelError,
} from '../types';
import { loadLocation, saveLocation, loadStop, saveStop } from '../utils/localStorage';

// ─── Actions ────────────────────────────────────────────────────────────────

type AppAction =
  | { type: 'SET_LOCATION'; payload: SavedLocation }
  | { type: 'SET_STOP'; payload: SavedStop }
  | { type: 'WEATHER_LOADING' }
  | { type: 'WEATHER_SUCCESS'; payload: WeatherData }
  | { type: 'WEATHER_ERROR'; payload: PanelError }
  | { type: 'TRANSPORT_LOADING' }
  | { type: 'TRANSPORT_SUCCESS'; payload: TransportData }
  | { type: 'TRANSPORT_ERROR'; payload: PanelError }
  | { type: 'OPEN_SETTINGS' }
  | { type: 'CLOSE_SETTINGS' };

// ─── Initial State ───────────────────────────────────────────────────────────

const initialState: AppState = {
  location: loadLocation(),
  stop: loadStop(),
  weather: { status: 'idle', data: null, error: null, lastUpdatedAt: null },
  transport: { status: 'idle', data: null, error: null, lastUpdatedAt: null },
  settingsOpen: false,
};

// ─── Reducer ─────────────────────────────────────────────────────────────────

function reducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_LOCATION':
      return { ...state, location: action.payload };
    case 'SET_STOP':
      return { ...state, stop: action.payload };
    case 'WEATHER_LOADING':
      return { ...state, weather: { ...state.weather, status: 'loading', error: null } };
    case 'WEATHER_SUCCESS':
      return {
        ...state,
        weather: { status: 'success', data: action.payload, error: null, lastUpdatedAt: Date.now() },
      };
    case 'WEATHER_ERROR':
      return { ...state, weather: { ...state.weather, status: 'error', error: action.payload } };
    case 'TRANSPORT_LOADING':
      return { ...state, transport: { ...state.transport, status: 'loading', error: null } };
    case 'TRANSPORT_SUCCESS':
      return {
        ...state,
        transport: { status: 'success', data: action.payload, error: null, lastUpdatedAt: Date.now() },
      };
    case 'TRANSPORT_ERROR':
      return { ...state, transport: { ...state.transport, status: 'error', error: action.payload } };
    case 'OPEN_SETTINGS':
      return { ...state, settingsOpen: true };
    case 'CLOSE_SETTINGS':
      return { ...state, settingsOpen: false };
  }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface AppContextValue {
  state: AppState;
  setLocation: (loc: SavedLocation) => void;
  setStop: (stop: SavedStop) => void;
  openSettings: () => void;
  closeSettings: () => void;
  refresh: () => void;
  retryWeather: () => void;
  retryTransport: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

// ─── API fetch helpers ────────────────────────────────────────────────────────

async function fetchWeatherData(lat: number, lon: number): Promise<WeatherData> {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lon));
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,windspeed_10m,weathercode');
  url.searchParams.set('daily', 'weathercode,temperature_2m_max,temperature_2m_min');
  url.searchParams.set('forecast_days', '5');
  url.searchParams.set('timezone', 'Australia/Sydney');
  url.searchParams.set('models', 'bom_access_global');

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<WeatherData>;
}

async function fetchTransportData(stopId: string): Promise<TransportData> {
  const apiKey = import.meta.env.VITE_TFNSW_API_KEY as string | undefined;
  if (!apiKey) {
    throw Object.assign(new Error('API key not configured'), { kind: 'auth' as const });
  }

  const url = new URL('https://api.transport.nsw.gov.au/v1/tp/departure_mon');
  url.searchParams.set('outputFormat', 'rapidJSON');
  url.searchParams.set('coordOutputFormat', 'EPSG:4326');
  url.searchParams.set('mode', 'direct');
  url.searchParams.set('type_dm', 'stop');
  url.searchParams.set('name_dm', stopId);
  url.searchParams.set('departureMonitorMacro', 'true');
  url.searchParams.set('TfNSWDM', 'true');
  url.searchParams.set('version', '10.2.1.42');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `apikey ${apiKey}` },
  });

  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error('Unauthorized'), { kind: 'auth' as const });
  }
  if (!res.ok) {
    throw Object.assign(new Error(`HTTP ${res.status}`), { kind: 'network' as const });
  }

  interface TfNSWResponse {
    stopEvents?: Array<{
      transportation?: {
        product?: { class?: number };
        number?: string;
        destination?: { name?: string };
      };
      departureTimePlanned?: string;
      departureTimeEstimated?: string;
    }>;
  }
  const json = (await res.json()) as TfNSWResponse;
  const events = json.stopEvents ?? [];

  const departures = events.slice(0, 5).map((e) => ({
    mode: e.transportation?.product?.class ?? 0,
    routeNumber: e.transportation?.number ?? '',
    destination: e.transportation?.destination?.name ?? '',
    departureTimePlanned: e.departureTimePlanned ?? '',
    departureTimeEstimated: e.departureTimeEstimated ?? null,
  }));

  return { departures };
}

// ─── Provider ────────────────────────────────────────────────────────────────

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const weatherInflightRef = useRef(false);
  const transportInflightRef = useRef(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const doWeatherFetch = useCallback(async (lat: number, lon: number) => {
    if (weatherInflightRef.current) return;
    weatherInflightRef.current = true;
    dispatch({ type: 'WEATHER_LOADING' });
    try {
      const data = await fetchWeatherData(lat, lon);
      dispatch({ type: 'WEATHER_SUCCESS', payload: data });
    } catch (err) {
      dispatch({
        type: 'WEATHER_ERROR',
        payload: { kind: 'network', message: String(err) },
      });
    } finally {
      weatherInflightRef.current = false;
    }
  }, []);

  const doTransportFetch = useCallback(async (stopId: string) => {
    if (transportInflightRef.current) return;
    transportInflightRef.current = true;
    dispatch({ type: 'TRANSPORT_LOADING' });
    try {
      const data = await fetchTransportData(stopId);
      dispatch({ type: 'TRANSPORT_SUCCESS', payload: data });
    } catch (err) {
      const kind =
        (err as { kind?: string }).kind === 'auth' ? 'auth' : 'network';
      dispatch({
        type: 'TRANSPORT_ERROR',
        payload: { kind, message: String(err) },
      });
    } finally {
      transportInflightRef.current = false;
    }
  }, []);

  const doRefresh = useCallback(
    (loc: AppState['location'], stp: AppState['stop']) => {
      if (loc) doWeatherFetch(loc.lat, loc.lon);
      if (stp) doTransportFetch(stp.id);
    },
    [doWeatherFetch, doTransportFetch]
  );

  const startInterval = useCallback(
    (loc: AppState['location'], stp: AppState['stop']) => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(() => doRefresh(loc, stp), REFRESH_INTERVAL_MS);
    },
    [doRefresh]
  );

  // Initial fetch on mount / when location or stop changes
  useEffect(() => {
    if (state.location) doWeatherFetch(state.location.lat, state.location.lon);
  }, [state.location, doWeatherFetch]);

  useEffect(() => {
    if (state.stop) doTransportFetch(state.stop.id);
  }, [state.stop, doTransportFetch]);

  // Auto-refresh interval
  useEffect(() => {
    if (!state.location && !state.stop) return;
    startInterval(state.location, state.stop);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [state.location, state.stop, startInterval]);

  const refresh = useCallback(() => {
    doRefresh(state.location, state.stop);
    startInterval(state.location, state.stop);
  }, [state.location, state.stop, doRefresh, startInterval]);

  const setLocation = useCallback((loc: SavedLocation) => {
    saveLocation(loc);
    dispatch({ type: 'SET_LOCATION', payload: loc });
  }, []);

  const setStop = useCallback((stop: SavedStop) => {
    saveStop(stop);
    dispatch({ type: 'SET_STOP', payload: stop });
  }, []);

  const retryWeather = useCallback(() => {
    if (state.location) doWeatherFetch(state.location.lat, state.location.lon);
  }, [state.location, doWeatherFetch]);

  const retryTransport = useCallback(() => {
    if (state.stop) doTransportFetch(state.stop.id);
  }, [state.stop, doTransportFetch]);

  return (
    <AppContext.Provider
      value={{
        state,
        setLocation,
        setStop,
        openSettings: () => dispatch({ type: 'OPEN_SETTINGS' }),
        closeSettings: () => dispatch({ type: 'CLOSE_SETTINGS' }),
        refresh,
        retryWeather,
        retryTransport,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
