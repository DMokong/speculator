import { ForecastCard } from './ForecastCard';
import type { WeatherDaily } from '../../types';

interface Props {
  daily: WeatherDaily;
}

export function ForecastStrip({ daily }: Props) {
  return (
    <div className="flex gap-2 mt-4">
      {daily.time.slice(0, 5).map((date, i) => (
        <ForecastCard
          key={date}
          isoDate={date}
          weathercode={daily.weathercode[i]}
          high={daily.temperature_2m_max[i]}
          low={daily.temperature_2m_min[i]}
        />
      ))}
    </div>
  );
}
