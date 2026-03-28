import { useWeather } from '../../hooks/useWeather';
import { useAppContext } from '../../context/AppContext';
import { CurrentConditions } from './CurrentConditions';
import { ForecastStrip } from './ForecastStrip';
import { WeatherError } from './WeatherError';
import { WeatherSkeleton } from './WeatherSkeleton';
import { OnboardingPrompt } from '../shared/OnboardingPrompt';
import { LastUpdated } from '../shared/LastUpdated';

export function WeatherPanel() {
  const { location, lastUpdated } = useAppContext();
  const { data, loading, error } = useWeather();

  return (
    <div className="bg-gray-800 rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          Weather {location ? `· ${location.name}` : ''}
        </h2>
        <LastUpdated date={lastUpdated} />
      </div>

      {!location && <OnboardingPrompt type="location" />}
      {location && loading && !data && <WeatherSkeleton />}
      {location && error && <WeatherError />}
      {location && data && !error && (
        <>
          <CurrentConditions current={data.current} />
          <ForecastStrip daily={data.daily} />
        </>
      )}
    </div>
  );
}
