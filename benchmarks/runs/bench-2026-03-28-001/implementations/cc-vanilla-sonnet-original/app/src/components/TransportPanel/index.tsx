import { useTransport } from '../../hooks/useTransport';
import { useAppContext } from '../../context/AppContext';
import { DepartureList } from './DepartureList';
import { TransportError } from './TransportError';
import { TransportSkeleton } from './TransportSkeleton';
import { OnboardingPrompt } from '../shared/OnboardingPrompt';

export function TransportPanel() {
  const { stop, setSettingsOpen } = useAppContext();
  const { departures, loading, error, missingApiKey } = useTransport();

  if (!stop) {
    return (
      <section className="bg-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">
          Transport
        </h2>
        <OnboardingPrompt
          type="stop"
          onOpenSettings={() => setSettingsOpen(true)}
        />
      </section>
    );
  }

  return (
    <section className="bg-gray-800 rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide">
          Transport
        </h2>
        <span className="text-sm text-gray-500">{stop.name}</span>
      </div>
      {loading && departures.length === 0 && <TransportSkeleton />}
      {error && <TransportError missingApiKey={missingApiKey} />}
      {!error && <DepartureList departures={departures} />}
    </section>
  );
}
