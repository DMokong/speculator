import { DepartureRow } from './DepartureRow';
import type { TransportData } from '../../types';

interface Props {
  data: TransportData;
}

export function DepartureList({ data }: Props) {
  if (data.departures.length === 0) {
    return (
      <p className="text-center text-gray-500 py-8 text-sm">
        No upcoming departures
      </p>
    );
  }

  return (
    <div>
      {data.departures.map((dep, i) => (
        <DepartureRow key={`${dep.departureTimePlanned}-${i}`} departure={dep} />
      ))}
    </div>
  );
}
