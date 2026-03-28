import { getWeatherInfo } from '../../data/weatherCodes';
import type { WeatherCurrent } from '../../types';

interface Props {
  current: WeatherCurrent;
}

export function CurrentConditions({ current }: Props) {
  const { label, icon } = getWeatherInfo(current.weathercode);
  return (
    <div>
      <div className="flex items-center gap-3">
        <span
          className="text-5xl leading-none"
          role="img"
          aria-label={label}
        >
          {icon}
        </span>
        <div>
          <div className="text-5xl font-bold text-gray-900">
            {Math.round(current.temperature_2m)}°C
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Feels like {Math.round(current.apparent_temperature)}°C
          </div>
        </div>
      </div>
      <div className="mt-3 text-sm text-gray-600">
        <span className="font-medium">Wind:</span>{' '}
        {Math.round(current.windspeed_10m)} km/h
      </div>
    </div>
  );
}
