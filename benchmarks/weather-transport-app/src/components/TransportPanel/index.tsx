import { useApp } from '../../context/AppContext';
import { TransportSkeleton } from './TransportSkeleton';
import { TransportError } from './TransportError';
import { DepartureList } from './DepartureList';
import { StalenessWarning } from '../shared/StalenessWarning';
import { LastUpdated } from '../shared/LastUpdated';

export function TransportPanel() {
  const { state, retryTransport } = useApp();
  const { transport, stop } = state;

  return (
    <section className="bg-white rounded-2xl shadow p-5 flex-1 min-w-0">
      <h2 className="text-lg font-semibold text-gray-700 mb-1">Departures</h2>
      {stop && (
        <p className="text-xs text-gray-400 mb-3">{stop.name}</p>
      )}
      <StalenessWarning lastUpdatedAt={transport.lastUpdatedAt} />

      {transport.status === 'loading' && <TransportSkeleton />}

      {transport.status === 'error' && transport.error && (
        <TransportError
          kind={transport.error.kind}
          onRetry={transport.error.kind !== 'auth' ? retryTransport : undefined}
        />
      )}

      {transport.status === 'success' && transport.data && (
        <DepartureList data={transport.data} />
      )}

      <LastUpdated lastUpdatedAt={transport.lastUpdatedAt} />
    </section>
  );
}
