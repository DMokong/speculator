import { useApp } from '../../context/AppContext';
import CurrentConditions from './CurrentConditions';
import ForecastStrip from './ForecastStrip';
import EarlyDepartureWarning from './EarlyDepartureWarning';
import { shouldRecommendEarlierDeparture } from '../../utils/weatherAnalysis';
import { geocodeSuburb } from '../../api/openmeteo';
import { useState } from 'react';

export default function WeatherPanel() {
  const { state, dispatch } = useApp();
  const [suburbInput, setSuburbInput] = useState('');
  const [geocoding, setGeocoding] = useState(false);

  async function handleSuburbSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!suburbInput.trim()) return;
    setGeocoding(true);
    try {
      const result = await geocodeSuburb(suburbInput.trim());
      if (result) {
        dispatch({ type: 'SET_LOCATION', lat: result.lat, lon: result.lon });
      }
    } catch {
      // silently ignore
    } finally {
      setGeocoding(false);
    }
  }

  if (state.userLat === null) {
    return (
      <div className="bg-gray-50 rounded-xl p-4">
        <p className="text-sm text-gray-600 mb-3">Enable location to see weather, or enter your suburb:</p>
        <form onSubmit={handleSuburbSubmit} className="flex gap-2">
          <input
            type="text"
            value={suburbInput}
            onChange={e => setSuburbInput(e.target.value)}
            placeholder="e.g. Sydney"
            className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            type="submit"
            disabled={geocoding}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50 min-h-[44px]"
          >
            {geocoding ? '…' : 'Go'}
          </button>
        </form>
      </div>
    );
  }

  if (!state.weatherCurrent) {
    return (
      <div className="bg-gray-50 rounded-xl p-4 flex items-center gap-3">
        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-gray-600">Loading weather…</p>
      </div>
    );
  }

  const { recommend, reason } = shouldRecommendEarlierDeparture(
    state.weatherForecast,
    state.weatherCurrent
  );

  return (
    <div className="bg-gray-50 rounded-xl overflow-hidden">
      <CurrentConditions weather={state.weatherCurrent} />
      {recommend && <EarlyDepartureWarning reason={reason} />}
      <ForecastStrip forecast={state.weatherForecast} />
    </div>
  );
}
