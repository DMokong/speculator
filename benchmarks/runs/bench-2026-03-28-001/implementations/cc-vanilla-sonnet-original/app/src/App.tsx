import { useEffect, useState, useCallback } from 'react';
import { useApp } from './context/AppContext';
import { useWeather } from './hooks/useWeather';
import { useAdvisories } from './hooks/useAdvisories';
import { useAutoRefresh } from './hooks/useAutoRefresh';
import Header from './components/Header';
import WeatherPanel from './components/WeatherPanel';
import AdvisoryBanner from './components/AdvisoryBanner';
import TripPlanner from './components/TripPlanner';
import RouteManager from './components/RouteManager';
import NotificationManager from './components/NotificationManager';

export default function App() {
  const { state, dispatch } = useApp();
  const { refresh: refreshWeather } = useWeather();
  const { refresh: refreshAdvisories } = useAdvisories();
  const [showRoutes, setShowRoutes] = useState(false);

  // Geolocation on mount
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          dispatch({ type: 'SET_LOCATION', lat: pos.coords.latitude, lon: pos.coords.longitude });
        },
        () => {
          // Denied or failed — use stored location (already in state from initialState)
        }
      );
    }
  }, [dispatch]);

  // Fetch weather when location becomes available
  useEffect(() => {
    if (state.userLat !== null && state.userLon !== null) {
      refreshWeather();
    }
  }, [state.userLat, state.userLon, refreshWeather]);

  // Fetch advisories when API key available
  useEffect(() => {
    if (state.apiKey) {
      refreshAdvisories();
    }
  }, [state.apiKey, refreshAdvisories]);

  const handleRefreshAll = useCallback(async () => {
    dispatch({ type: 'SET_REFRESHING', value: true });
    try {
      await Promise.all([
        refreshWeather(),
        refreshAdvisories(),
      ]);
      dispatch({ type: 'SET_LAST_REFRESHED', ts: Date.now() });
    } finally {
      dispatch({ type: 'SET_REFRESHING', value: false });
    }
  }, [refreshWeather, refreshAdvisories, dispatch]);

  useAutoRefresh(handleRefreshAll, 90_000);

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      <Header onRefresh={handleRefreshAll} />
      <AdvisoryBanner />

      {/* No API key warning */}
      {!state.apiKey && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-3 text-sm text-red-800 flex items-center gap-2">
          <span>⚠️</span>
          <span>TfNSW API key required for transport data. Open ⚙️ Settings to enter your key.</span>
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left column / top on mobile */}
        <div className="md:w-72 lg:w-80 flex-shrink-0 p-4 space-y-4 md:overflow-y-auto md:border-r border-gray-200 bg-gray-50">
          <WeatherPanel />
          {/* On desktop, show RouteManager in sidebar */}
          <div className="hidden md:block">
            <RouteManager />
          </div>
        </div>

        {/* Main content */}
        <div className="flex-1 p-4 overflow-y-auto">
          <TripPlanner />
        </div>
      </div>

      {/* Mobile: Routes bottom sheet */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40">
        <button
          onClick={() => setShowRoutes(true)}
          className="w-full bg-white border-t border-gray-200 py-3 text-sm font-medium text-blue-600 hover:bg-gray-50 min-h-[44px]"
        >
          My Routes ({state.savedRoutes.length})
        </button>
      </div>

      {/* Mobile routes drawer */}
      {showRoutes && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowRoutes(false)} />
          <div className="relative bg-white rounded-t-2xl h-[80vh] overflow-hidden">
            <RouteManager onClose={() => setShowRoutes(false)} />
          </div>
        </div>
      )}

      <NotificationManager />
    </div>
  );
}
