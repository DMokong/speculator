import { useApp } from '../../context/AppContext';

export function OnboardingPrompt() {
  const { openSettings } = useApp();
  return (
    <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
      <div className="text-5xl mb-4" role="img" aria-label="map">🗺️</div>
      <h2 className="text-xl font-semibold text-gray-800 mb-2">
        Set up your commute
      </h2>
      <p className="text-gray-500 mb-6">
        Open Settings to choose a location and transport stop.
      </p>
      <button
        onClick={openSettings}
        className="rounded-lg bg-blue-600 px-6 py-3 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Open Settings
      </button>
    </div>
  );
}
