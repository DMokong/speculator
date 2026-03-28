interface Props {
  kind: 'auth' | 'network' | 'unknown';
  onRetry?: () => void;
}

export function TransportError({ kind, onRetry }: Props) {
  if (kind === 'auth') {
    return (
      <div
        className="flex flex-col items-center justify-center py-8 text-center"
        role="alert"
      >
        <div className="text-4xl mb-3" role="img" aria-label="key">🔑</div>
        <p className="text-gray-600 text-sm">
          API key not configured or invalid — check Settings
        </p>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col items-center justify-center py-8 text-center"
      role="alert"
    >
      <div className="text-4xl mb-3" role="img" aria-label="warning">⚠️</div>
      <p className="text-gray-600 mb-4 text-sm">
        Couldn&apos;t load departures. Please try again.
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg bg-blue-600 px-5 py-2 text-white font-medium hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        >
          Retry
        </button>
      )}
    </div>
  );
}
