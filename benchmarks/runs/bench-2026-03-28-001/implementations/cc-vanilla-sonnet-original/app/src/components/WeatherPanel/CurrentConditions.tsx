import type { WeatherCurrent } from '../../types';
import { getWeatherInfo } from '../../data/weatherCodes';

interface Props { weather: WeatherCurrent }

export default function CurrentConditions({ weather }: Props) {
  const info = getWeatherInfo(weather.weatherCode);
  return (
    <div className="flex items-center gap-4 p-4">
      <span className="text-5xl">{info.icon}</span>
      <div>
        <p className="text-4xl font-bold text-gray-900">{Math.round(weather.tempC)}°C</p>
        <p className="text-sm text-gray-600">Feels like {Math.round(weather.feelsLikeC)}°C</p>
        <p className="text-sm text-gray-600">{info.label} · {Math.round(weather.windKph)} km/h wind</p>
      </div>
    </div>
  );
}
