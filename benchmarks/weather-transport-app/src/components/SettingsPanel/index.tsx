import { useApp } from '../../context/AppContext';
import { LocationSearch } from './LocationSearch';
import { StopSearch } from './StopSearch';

export function SettingsPanel() {
  const { state, closeSettings } = useApp();

  if (!state.settingsOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/40 z-40"
        onClick={closeSettings}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-label="Settings"
        aria-modal="true"
        className="fixed inset-y-0 right-0 z-50 w-full max-w-sm bg-white shadow-xl flex flex-col"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">Settings</h2>
          <button
            onClick={closeSettings}
            className="text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded p-1"
            aria-label="Close settings"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          <LocationSearch />
          <StopSearch />
        </div>

        <div className="px-5 py-4 border-t border-gray-200">
          <button
            onClick={closeSettings}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Done
          </button>
        </div>
      </div>
    </>
  );
}
