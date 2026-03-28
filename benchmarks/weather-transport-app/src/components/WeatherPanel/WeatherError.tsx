interface Props {
  onRetry: () => void;
}

export function WeatherError({ onRetry }: Props) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center" role="alert">
      <div className="text-4xl mb-3" role="img" aria-label="warning">⚠️</div>
      <p className="text-gray-600 mb-4">Weather unavailable — tap to retry</p>
      <button
        onClick={onRetry}
        className="rounded-lg bg-blue-600 px-5 py-2 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        Retry
      </button>
    </div>
  );
}
