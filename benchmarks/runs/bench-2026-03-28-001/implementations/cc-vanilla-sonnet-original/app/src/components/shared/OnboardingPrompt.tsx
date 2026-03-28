interface Props {
  type: 'location' | 'stop';
  onOpenSettings: () => void;
}

export function OnboardingPrompt({ type, onOpenSettings }: Props) {
  const message =
    type === 'location'
      ? 'Set your location to see weather'
      : 'Set a transport stop to see departures';

  return (
    <div className="flex flex-col items-center justify-center h-40 text-gray-400 gap-3">
      <p className="text-sm">{message}</p>
      <button
        onClick={onOpenSettings}
        className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-500 transition-colors"
      >
        Open Settings
      </button>
    </div>
  );
}
