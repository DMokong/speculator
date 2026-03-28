import { useTransport } from '../../hooks/useTransport';
import { useAppContext } from '../../context/AppContext';
import { DepartureList } from './DepartureList';
import { TransportError } from './TransportError';
import { TransportSkeleton } from './TransportSkeleton';
import { OnboardingPrompt } from '../shared/OnboardingPrompt';
import { LastUpdated } from '../shared/LastUpdated';

export function TransportPanel() {
  const { stop, lastUpdated } = useAppContext();
  const { departures, loading, error, missingApiKey } = useTransport();

  const showError = error || (missingApiKey && !!stop);

  return (
    <div className="bg-gray-800 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wide">
          Departures {stop ? `· ${stop.name}` : ''}
        </h2>
        <LastUpdated date={lastUpdated} />
      </div>

      {missingApiKey && !stop && (
        <TransportError missingApiKey />
      )}
      {!stop && !missingApiKey && <OnboardingPrompt type="stop" />}
      {stop && loading && departures.length === 0 && <TransportSkeleton />}
      {stop && showError && <TransportError missingApiKey={missingApiKey} />}
      {stop && !showError && !loading && (
        <DepartureList departures={departures} />
      )}
      {stop && !showError && loading && departures.length > 0 && (
        <DepartureList departures={departures} />
      )}
    </div>
  );
}
