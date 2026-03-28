import type { WeatherData } from '../../types';
import { getWeatherInfo } from '../../data/weatherCodes';

interface CurrentConditionsProps {
  current: WeatherData['current'];
}

export function CurrentConditions({ current }: CurrentConditionsProps) {
  const { label, icon } = getWeatherInfo(current.weatherCode);

  return (
    <div className="flex items-center gap-4 mb-4">
      <span className="text-6xl" role="img" aria-label={label}>{icon}</span>
      <div>
        <div className="text-4xl font-bold text-white">
          {Math.round(current.temp)}°C
        </div>
        <div className="text-sm text-gray-400">
          Feels like {Math.round(current.feelsLike)}°C · {Math.round(current.windSpeed)} km/h wind
        </div>
        <div className="text-sm text-gray-400">{label}</div>
      </div>
    </div>
  );
}
