import type { Departure, TransportMode } from '../../types';
import { formatDepartureTime } from '../../utils/time';

const MODE_ICONS: Record<TransportMode, string> = {
  train: '🚆',
  bus: '🚌',
  ferry: '⛴️',
  lightrail: '🚊',
  coach: '🚍',
  metro: '🚇',
};

interface Props {
  departure: Departure;
}

export function DepartureRow({ departure }: Props) {
  const {
    mode,
    routeNumber,
    destination,
    scheduledDeparture,
    estimatedDeparture,
    isDelayed,
  } = departure;

  return (
    <div className="flex items-center gap-3 p-2 bg-gray-700/50 rounded-lg">
      <span className="text-xl flex-none" aria-label={mode}>
        {MODE_ICONS[mode]}
      </span>
      <div className="flex-none w-10">
        <span className="text-sm font-bold text-white">{routeNumber}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white truncate">{destination}</p>
      </div>
      <div className="flex-none text-right">
        {isDelayed ? (
          <div>
            <p className="text-xs text-gray-400 line-through">
              {formatDepartureTime(scheduledDeparture)}
            </p>
            <p className="text-sm font-semibold text-amber-400">
              {estimatedDeparture
                ? formatDepartureTime(estimatedDeparture)
                : '—'}
            </p>
          </div>
        ) : (
          <p className="text-sm font-semibold text-green-400">
            {formatDepartureTime(scheduledDeparture)}
          </p>
        )}
      </div>
    </div>
  );
}
