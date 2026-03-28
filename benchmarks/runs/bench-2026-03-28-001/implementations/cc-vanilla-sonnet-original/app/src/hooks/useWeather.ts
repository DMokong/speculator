import { useCallback } from 'react';
import { useApp } from '../context/AppContext';
import { fetchCurrentWeather, fetchWeatherForecast } from '../api/openmeteo';

export function useWeather() {
  const { state, dispatch } = useApp();

  const refresh = useCallback(async () => {
    const lat = state.userLat;
    const lon = state.userLon;
    if (lat === null || lon === null) return;

    try {
      const [current, forecast] = await Promise.all([
        fetchCurrentWeather(lat, lon),
        fetchWeatherForecast(lat, lon),
      ]);
      dispatch({ type: 'SET_WEATHER', current, forecast });
    } catch (err) {
      console.error('Weather fetch failed:', err);
    }
  }, [state.userLat, state.userLon, dispatch]);

  return { refresh };
}
