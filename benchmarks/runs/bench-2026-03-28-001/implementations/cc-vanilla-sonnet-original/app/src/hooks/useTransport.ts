import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { computeTripOptions } from '../utils/tripFeasibility';

export function useTransport() {
  const { state, dispatch } = useApp();

  const refreshTrips = useCallback(async () => {
    const route = state.savedRoutes.find(r => r.id === state.activeRouteId);
    if (!route || !state.apiKey) return;

    dispatch({ type: 'SET_REFRESHING', value: true });
    try {
      const options = await computeTripOptions(route, state.stops, state.apiKey);
      dispatch({ type: 'SET_TRIP_OPTIONS', options });
    } catch (err) {
      console.error('Trip fetch failed:', err);
    } finally {
      dispatch({ type: 'SET_REFRESHING', value: false });
    }
  }, [state.activeRouteId, state.savedRoutes, state.stops, state.apiKey, dispatch]);

  return { refreshTrips };
}
