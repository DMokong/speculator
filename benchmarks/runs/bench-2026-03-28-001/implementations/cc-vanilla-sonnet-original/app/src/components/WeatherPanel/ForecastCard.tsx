import type { DailyForecast } from '../../types';
import { getWeatherInfo } from '../../data/weatherCodes';
import { formatDayLabel } from '../../utils/time';

interface Props {
  forecast: DailyForecast;
}

export function ForecastCard({ forecast }: Props) {
  const { icon } = getWeatherInfo(forecast.weatherCode);
  return (
    <div className="flex flex-col items-center gap-1 bg-gray-700/50 rounded-lg p-2 min-w-0 flex-1">
      <span className="text-xs text-gray-400 font-medium truncate w-full text-center">
        {formatDayLabel(forecast.date)}
      </span>
      <span className="text-xl">{icon}</span>
      <span className="text-sm font-semibold text-white">
        {Math.round(forecast.tempMax)}°
      </span>
      <span className="text-xs text-gray-400">{Math.round(forecast.tempMin)}°</span>
    </div>
  );
}
