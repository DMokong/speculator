import type { Departure, TransportMode } from '../../types';
import { formatTime } from '../../utils/time';

const MODE_ICONS: Record<TransportMode, string> = {
  train:     '🚆',
  bus:       '🚌',
  ferry:     '⛴️',
  lightrail: '🚊',
  coach:     '🚍',
  metro:     '🚇',
};

interface DepartureRowProps {
  departure: Departure;
}

export function DepartureRow({ departure }: DepartureRowProps) {
  const { mode, routeNumber, destination, scheduledDeparture, estimatedDeparture, isDelayed } = departure;

  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-700/50 last:border-0">
      <span className="text-xl" role="img" aria-label={mode}>{MODE_ICONS[mode]}</span>
      <span className="text-sm font-mono font-semibold text-blue-400 w-10 shrink-0">
        {routeNumber}
      </span>
      <span className="flex-1 text-sm text-gray-200 truncate">{destination}</span>
      <div className="text-right shrink-0">
        {isDelayed ? (
          <>
            <span className="text-xs text-gray-500 line-through block">
              {formatTime(scheduledDeparture)}
            </span>
            <span className="text-sm text-amber-400 font-medium">
              {estimatedDeparture ? formatTime(estimatedDeparture) : '—'}
            </span>
          </>
        ) : (
          <span className="text-sm text-green-400 font-medium">
            {formatTime(scheduledDeparture)}
          </span>
        )}
      </div>
    </div>
  );
}
