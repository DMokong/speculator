import type { DailyForecast } from '../../types';
import { getWeatherInfo } from '../../data/weatherCodes';
import { getDayLabel } from '../../utils/time';

interface ForecastCardProps {
  forecast: DailyForecast;
}

export function ForecastCard({ forecast }: ForecastCardProps) {
  const { icon, label } = getWeatherInfo(forecast.weatherCode);

  return (
    <div className="flex flex-col items-center gap-1 bg-gray-700/50 rounded-lg p-2 min-w-0">
      <span className="text-xs text-gray-400 truncate w-full text-center">
        {getDayLabel(forecast.date)}
      </span>
      <span className="text-2xl" role="img" aria-label={label}>{icon}</span>
      <span className="text-xs text-white font-medium">{Math.round(forecast.tempMax)}°</span>
      <span className="text-xs text-gray-400">{Math.round(forecast.tempMin)}°</span>
    </div>
  );
}
