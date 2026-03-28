import type { WeatherData } from '../../types';
import { getWeatherInfo } from '../../data/weatherCodes';

interface Props {
  current: WeatherData['current'];
}

export function CurrentConditions({ current }: Props) {
  const { label, icon } = getWeatherInfo(current.weatherCode);
  return (
    <div>
      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-bold text-white">
          {Math.round(current.temp)}°C
        </span>
        <span className="text-3xl" aria-label={label}>
          {icon}
        </span>
      </div>
      <p className="text-gray-400 text-sm mt-1">{label}</p>
      <div className="flex gap-4 mt-2 text-sm text-gray-300">
        <span>Feels like {Math.round(current.feelsLike)}°C</span>
        <span>Wind {Math.round(current.windSpeed)} km/h</span>
      </div>
    </div>
  );
}
