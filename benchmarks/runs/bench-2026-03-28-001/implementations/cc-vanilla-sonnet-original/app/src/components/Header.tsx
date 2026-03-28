import { useAppContext } from '../context/AppContext';
import { getGreeting } from '../utils/time';
import { LastUpdated } from './shared/LastUpdated';

export function Header() {
  const { triggerRefresh, settingsOpen, setSettingsOpen, lastUpdated } =
    useAppContext();

  return (
    <header className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
      <div>
        <h1 className="text-lg font-semibold text-white">{getGreeting()}</h1>
        {lastUpdated && <LastUpdated date={lastUpdated} />}
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => triggerRefresh()}
          aria-label="Refresh data"
          title="Refresh"
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors text-lg"
        >
          ↻
        </button>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          aria-label="Open settings"
          title="Settings"
          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700 rounded-lg transition-colors text-lg"
        >
          ⚙
        </button>
      </div>
    </header>
  );
}
