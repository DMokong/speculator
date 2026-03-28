interface TransportErrorProps {
  missingApiKey: boolean;
}

export function TransportError({ missingApiKey }: TransportErrorProps) {
  if (missingApiKey) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-8 text-amber-400">
        <span className="text-3xl">🔑</span>
        <p className="text-sm font-medium">TfNSW API key not configured</p>
        <p className="text-xs text-gray-400 text-center">
          Add <code className="bg-gray-700 px-1 rounded">VITE_TFNSW_API_KEY</code> to your{' '}
          <code className="bg-gray-700 px-1 rounded">.env.local</code> file.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-red-400">
      <span className="text-3xl">⚠️</span>
      <p className="text-sm">Failed to load departure data.</p>
      <p className="text-xs text-gray-500">Check your connection and try refreshing.</p>
    </div>
  );
}
