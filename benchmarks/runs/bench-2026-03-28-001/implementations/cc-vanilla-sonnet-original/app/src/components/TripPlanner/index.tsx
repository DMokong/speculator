import { useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { useTransport } from '../../hooks/useTransport';
import { useBehaviorLearning } from '../../hooks/useBehaviorLearning';
import TripOptionCard from './TripOptionCard';
import { formatHHmm } from '../../utils/time';

export default function TripPlanner() {
  const { state } = useApp();
  const { refreshTrips } = useTransport();
  const activeRoute = state.savedRoutes.find(r => r.id === state.activeRouteId);

  const { pattern } = useBehaviorLearning(state.activeRouteId ?? '');

  useEffect(() => {
    if (state.activeRouteId) {
      refreshTrips();
    }
  }, [state.activeRouteId, refreshTrips]);

  if (!activeRoute) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center px-4">
        <span className="text-4xl mb-3">🚆</span>
        <p className="text-gray-600 text-sm">Select a route from My Routes to see trip options.</p>
      </div>
    );
  }

  // Check if current time is within 30 min of typical departure
  let behaviorSuggestion: string | null = null;
  if (pattern && pattern.confidence > 0.3) {
    const now = new Date();
    const target = new Date();
    target.setHours(pattern.typicalDepartureHour, pattern.typicalDepartureMinute, 0, 0);
    const diff = Math.abs(target.getTime() - now.getTime()) / 60000;
    if (diff <= 30 && now.getDay() === target.getDay()) {
      behaviorSuggestion = `You usually check this route around ${formatHHmm(pattern.typicalDepartureHour, pattern.typicalDepartureMinute)} — here are today's options.`;
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">{activeRoute.name}</h2>
        {state.isRefreshing && (
          <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {behaviorSuggestion && (
        <div className="bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-sm text-blue-800">
          {behaviorSuggestion}
        </div>
      )}

      {!state.apiKey && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-800">
          API key required. Open settings (⚙️) to enter your TfNSW API key.
        </div>
      )}

      {state.tripOptions.length === 0 && !state.isRefreshing && (
        <p className="text-sm text-gray-500 py-4 text-center">
          No feasible trips found for the next 2 hours.
        </p>
      )}

      {state.tripOptions.map((opt, i) => (
        <TripOptionCard key={i} option={opt} advisories={state.advisories} />
      ))}
    </div>
  );
}
