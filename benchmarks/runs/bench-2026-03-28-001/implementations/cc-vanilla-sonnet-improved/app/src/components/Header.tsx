import { useAppContext } from '../context/AppContext';
import { getGreeting } from '../utils/time';

export function Header() {
  const { triggerRefresh, settingsOpen, setSettingsOpen } = useAppContext();

  return (
    <header className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
      <h1 className="text-lg font-semibold text-white">{getGreeting()}</h1>
      <div className="flex items-center gap-2">
        <button
          onClick={triggerRefresh}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title="Refresh data"
          aria-label="Refresh data"
        >
          🔄
        </button>
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          title="Settings"
          aria-label="Toggle settings"
        >
          ⚙️
        </button>
      </div>
    </header>
  );
}
