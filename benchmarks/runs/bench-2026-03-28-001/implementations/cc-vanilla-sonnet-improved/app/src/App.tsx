import { useEffect } from 'react';
import { useAppContext } from './context/AppContext';
import { Header } from './components/Header';
import { WeatherPanel } from './components/WeatherPanel';
import { TransportPanel } from './components/TransportPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { StalenessWarning } from './components/shared/StalenessWarning';

const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const STALENESS_THRESHOLD_MS = 10 * 60 * 1000;

export function App() {
  const { triggerRefresh, lastUpdated, settingsOpen } = useAppContext();

  // Auto-refresh every 5 minutes
  useEffect(() => {
    const id = setInterval(() => triggerRefresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [triggerRefresh]);

  const isStale = lastUpdated !== null &&
    (Date.now() - lastUpdated.getTime()) > STALENESS_THRESHOLD_MS;

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Header />
      <main className="p-4 max-w-5xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {isStale && <StalenessWarning />}
          <WeatherPanel />
          <TransportPanel />
        </div>
      </main>
      {settingsOpen && <SettingsPanel />}
    </div>
  );
}
