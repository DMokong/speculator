import type { DailyForecast } from '../../types';
import { ForecastCard } from './ForecastCard';

interface Props {
  forecasts: DailyForecast[];
}

export function ForecastStrip({ forecasts }: Props) {
  return (
    <div className="flex gap-2">
      {forecasts.map(f => (
        <ForecastCard key={f.date} forecast={f} />
      ))}
    </div>
  );
}
