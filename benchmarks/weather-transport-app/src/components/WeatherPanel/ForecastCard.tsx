import { getDayLabel } from '../../utils/time';
import { getWeatherInfo } from '../../data/weatherCodes';

interface Props {
  isoDate: string;
  weathercode: number;
  high: number;
  low: number;
}

export function ForecastCard({ isoDate, weathercode, high, low }: Props) {
  const { label, icon } = getWeatherInfo(weathercode);
  return (
    <div className="flex flex-col items-center bg-blue-50 rounded-lg p-2 flex-1 min-w-0">
      <span className="text-xs font-medium text-gray-600">{getDayLabel(isoDate)}</span>
      <span
        className="my-1 text-2xl leading-none"
        role="img"
        aria-label={label}
      >
        {icon}
      </span>
      <span className="text-sm font-bold text-gray-800">{Math.round(high)}°</span>
      <span className="text-xs text-gray-500">{Math.round(low)}°</span>
    </div>
  );
}
