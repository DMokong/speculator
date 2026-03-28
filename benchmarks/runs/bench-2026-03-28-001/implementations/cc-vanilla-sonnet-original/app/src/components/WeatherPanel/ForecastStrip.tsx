import type { WeatherForecastDay } from '../../types';
import { getWeatherInfo } from '../../data/weatherCodes';

interface Props { forecast: WeatherForecastDay[] }

function dayLabel(dateStr: string, index: number): string {
  if (index === 0) return 'Today';
  if (index === 1) return 'Tomorrow';
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('en-AU', { weekday: 'short' });
}

export default function ForecastStrip({ forecast }: Props) {
  return (
    <div className="flex gap-2 overflow-x-auto px-4 pb-2">
      {forecast.map((day, i) => {
        const info = getWeatherInfo(day.weatherCode);
        return (
          <div key={day.date} className="flex-shrink-0 flex flex-col items-center bg-white rounded-xl p-3 border border-gray-100 min-w-[72px]">
            <p className="text-xs font-medium text-gray-500 mb-1">{dayLabel(day.date, i)}</p>
            <span className="text-2xl mb-1">{info.icon}</span>
            <p className="text-xs font-bold text-gray-800">{Math.round(day.highC)}° / {Math.round(day.lowC)}°</p>
            {day.precipitationProbability > 20 && (
              <span className="mt-1 text-xs text-blue-600 font-medium">{day.precipitationProbability}%</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
