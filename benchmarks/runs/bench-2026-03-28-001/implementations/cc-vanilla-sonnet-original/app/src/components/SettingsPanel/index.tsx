import { useAppContext } from '../../context/AppContext';
import { LocationSearch } from './LocationSearch';
import { StopSearch } from './StopSearch';

export function SettingsPanel() {
  const { setSettingsOpen } = useAppContext();

  return (
    <>
      {/* Backdrop for mobile */}
      <div
        className="fixed inset-0 bg-black/50 z-40 md:hidden"
        onClick={() => setSettingsOpen(false)}
        aria-hidden="true"
      />
      {/* Drawer panel */}
      <aside className="fixed bottom-0 left-0 right-0 md:bottom-auto md:right-0 md:top-0 md:left-auto md:w-80 md:h-full bg-gray-800 border-t md:border-t-0 md:border-l border-gray-700 z-50 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
          <h2 className="text-base font-semibold text-white">Settings</h2>
          <button
            onClick={() => setSettingsOpen(false)}
            aria-label="Close settings"
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            ✕
          </button>
        </div>
        <div className="p-4 space-y-6 overflow-y-auto flex-1">
          <LocationSearch />
          <StopSearch />
        </div>
      </aside>
    </>
  );
}
