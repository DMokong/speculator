interface Props {
  missingApiKey: boolean;
}

export function TransportError({ missingApiKey }: Props) {
  if (missingApiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-40 text-amber-400 gap-2 text-sm text-center px-4">
        <p className="font-semibold">TfNSW API key not configured.</p>
        <p className="text-gray-400">
          Add{' '}
          <code className="bg-gray-700 px-1 rounded">
            VITE_TFNSW_API_KEY=your_key
          </code>{' '}
          to{' '}
          <code className="bg-gray-700 px-1 rounded">.env.local</code> and
          restart the dev server.
        </p>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-center h-40 text-red-400 text-sm text-center px-4">
      <p>Unable to load departure data. Check your connection and try refreshing.</p>
    </div>
  );
}
