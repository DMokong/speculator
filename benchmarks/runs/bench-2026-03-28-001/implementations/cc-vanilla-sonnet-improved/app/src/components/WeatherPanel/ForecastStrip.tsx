import type { DailyForecast } from '../../types';
import { ForecastCard } from './ForecastCard';

interface ForecastStripProps {
  daily: DailyForecast[];
}

export function ForecastStrip({ daily }: ForecastStripProps) {
  return (
    <div className="grid grid-cols-5 gap-2">
      {daily.map(forecast => (
        <ForecastCard key={forecast.date} forecast={forecast} />
      ))}
    </div>
  );
}
