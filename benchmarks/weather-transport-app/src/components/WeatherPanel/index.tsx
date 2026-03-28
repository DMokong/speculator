import { useApp } from '../../context/AppContext';
import { WeatherSkeleton } from './WeatherSkeleton';
import { WeatherError } from './WeatherError';
import { CurrentConditions } from './CurrentConditions';
import { ForecastStrip } from './ForecastStrip';
import { StalenessWarning } from '../shared/StalenessWarning';
import { LastUpdated } from '../shared/LastUpdated';

export function WeatherPanel() {
  const { state, retryWeather } = useApp();
  const { weather } = state;

  return (
    <section className="bg-white rounded-2xl shadow p-5 flex-1 min-w-0">
      <h2 className="text-lg font-semibold text-gray-700 mb-3">Weather</h2>
      <StalenessWarning lastUpdatedAt={weather.lastUpdatedAt} />

      {weather.status === 'loading' && <WeatherSkeleton />}

      {weather.status === 'error' && (
        <WeatherError onRetry={retryWeather} />
      )}

      {weather.status === 'success' && weather.data && (
        <>
          <CurrentConditions current={weather.data.current} />
          <ForecastStrip daily={weather.data.daily} />
        </>
      )}

      <LastUpdated lastUpdatedAt={weather.lastUpdatedAt} />
    </section>
  );
}
