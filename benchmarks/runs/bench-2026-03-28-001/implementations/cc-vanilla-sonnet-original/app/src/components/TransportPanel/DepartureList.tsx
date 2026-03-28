import type { Departure } from '../../types';
import { DepartureRow } from './DepartureRow';

interface Props {
  departures: Departure[];
}

export function DepartureList({ departures }: Props) {
  if (departures.length === 0) {
    return (
      <p className="text-gray-400 text-sm text-center py-8">
        No upcoming departures.
      </p>
    );
  }
  return (
    <div className="space-y-2">
      {departures.map((d, i) => (
        <DepartureRow key={`${d.routeNumber}-${d.scheduledDeparture}-${i}`} departure={d} />
      ))}
    </div>
  );
}
