import { formatTime } from '../../utils/time';
import type { Departure } from '../../types';

const MODE_LABELS: Record<number, string> = {
  1: 'Train',
  4: 'Light Rail',
  5: 'Bus',
  9: 'Ferry',
  11: 'Coach',
};

const MODE_ICONS: Record<number, string> = {
  1: '🚆',
  4: '🚊',
  5: '🚌',
  9: '⛴️',
  11: '🚌',
};

function isDelayed(planned: string, estimated: string | null): boolean {
  if (!estimated) return false;
  return new Date(estimated) > new Date(planned);
}

interface Props {
  departure: Departure;
}

export function DepartureRow({ departure }: Props) {
  const { mode, routeNumber, destination, departureTimePlanned, departureTimeEstimated } = departure;
  const delayed = isDelayed(departureTimePlanned, departureTimeEstimated);
  const modeLabel = MODE_LABELS[mode] ?? 'Transit';
  const modeIcon = MODE_ICONS[mode] ?? '🚌';

  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
      <span
        role="img"
        aria-label={modeLabel}
        className="text-xl w-8 text-center flex-shrink-0 leading-none"
      >
        {modeIcon}
      </span>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          {routeNumber && (
            <span className="text-xs font-bold bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded flex-shrink-0">
              {routeNumber}
            </span>
          )}
          <span className="text-sm text-gray-800 truncate">{destination}</span>
        </div>
        <div className="text-xs text-gray-500 mt-0.5">{modeLabel}</div>
      </div>

      <div className="flex flex-col items-end flex-shrink-0">
        <span className="text-sm font-medium text-gray-800">
          {departureTimePlanned ? formatTime(departureTimePlanned) : '—'}
        </span>
        {delayed ? (
          <span
            className="text-xs font-semibold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded mt-0.5"
            aria-label="Delayed"
          >
            Delayed{departureTimeEstimated ? ` ${formatTime(departureTimeEstimated)}` : ''}
          </span>
        ) : (
          <span
            className="text-xs font-semibold text-green-700 bg-green-100 px-1.5 py-0.5 rounded mt-0.5"
            aria-label="On time"
          >
            On time
          </span>
        )}
      </div>
    </div>
  );
}
