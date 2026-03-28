import { useWeather } from '../../hooks/useWeather';
import { useAppContext } from '../../context/AppContext';
import { CurrentConditions } from './CurrentConditions';
import { ForecastStrip } from './ForecastStrip';
import { WeatherError } from './WeatherError';
import { WeatherSkeleton } from './WeatherSkeleton';
import { OnboardingPrompt } from '../shared/OnboardingPrompt';

export function WeatherPanel() {
  const { location, setSettingsOpen } = useAppContext();
  const { data, loading, error } = useWeather();

  if (!location) {
    return (
      <section className="bg-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Weather
        </h2>
        <OnboardingPrompt
          type="location"
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </section>
    );
  }

  return (
    <section className="bg-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Weather
        </h2>
        <span className="text-sm text-gray-500">{location.name}</span>
      </div>
      {loading && !data && <WeatherSkeleton />}
      {error && <WeatherError />}
      {data && !error && (
        <>
          <CurrentConditions current={data.current} />
          <ForecastStrip forecasts={data.daily} />
        </>
      )}
    </section>
  );
}
