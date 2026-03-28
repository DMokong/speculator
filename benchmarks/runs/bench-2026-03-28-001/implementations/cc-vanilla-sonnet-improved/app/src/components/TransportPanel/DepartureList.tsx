import type { Departure } from '../../types';
import { DepartureRow } from './DepartureRow';

interface DepartureListProps {
  departures: Departure[];
}

export function DepartureList({ departures }: DepartureListProps) {
  if (departures.length === 0) {
    return (
      <div className="py-8 text-center text-gray-500 text-sm">
        No upcoming departures found.
      </div>
    );
  }

  return (
    <div>
      {departures.map((dep, i) => (
        <DepartureRow key={`${dep.routeNumber}-${dep.scheduledDeparture}-${i}`} departure={dep} />
      ))}
    </div>
  );
}
