import { useState, useEffect, useRef } from 'react';
import { useAppContext } from '../../context/AppContext';
import type { SavedStop, TransportMode } from '../../types';

const PRODUCT_CLASS_MAP: Record<number, TransportMode> = {
  1: 'train',
  4: 'lightrail',
  5: 'bus',
  7: 'coach',
  9: 'ferry',
  11: 'metro',
};

interface StopResult {
  stopId: string;
  name: string;
  modes: TransportMode[];
}

export function StopSearch() {
  const { stop, setStop } = useAppContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StopResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apiKey = import.meta.env.VITE_TFNSW_API_KEY as string | undefined;
  const missingApiKey = !apiKey || apiKey === 'your_api_key_here';

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2 || missingApiKey) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(false);

    const controller = new AbortController();

    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams({
        outputFormat: 'rapidJSON',
        type_sf: 'stop',
        name_sf: query,
        TfNSWTR: 'true',
      });

      fetch(`https://api.transport.nsw.gov.au/v1/tp/stop_finder?${params}`, {
        headers: {
          Authorization: `apikey ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((json: {
          locations?: Array<{
            id: string;
            name: string;
            productClasses?: number[];
          }>;
        }) => {
          const stops: StopResult[] = (json.locations ?? []).slice(0, 10).map(loc => ({
            stopId: loc.id,
            name: loc.name,
            modes: (loc.productClasses ?? [])
              .map(c => PRODUCT_CLASS_MAP[c])
              .filter((m): m is TransportMode => m !== undefined),
          }));
          setResults(stops);
          setLoading(false);
        })
        .catch(err => {
          if (err instanceof Error && err.name === 'AbortError') return;
          setError(true);
          setLoading(false);
        });
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      controller.abort();
    };
  }, [query, missingApiKey, apiKey]);

  function handleSelect(result: StopResult) {
    const savedStop: SavedStop = {
      stopId: result.stopId,
      name: result.name,
      modes: result.modes,
    };
    setStop(savedStop);
    setQuery('');
    setResults([]);
  }

  if (missingApiKey) {
    return (
      <div>
        <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Transport Stop</label>
        <p className="text-xs text-amber-400">
          Add <code className="bg-gray-700 px-1 rounded">VITE_TFNSW_API_KEY</code> to{' '}
          <code className="bg-gray-700 px-1 rounded">.env.local</code> to enable stop search.
        </p>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-xs text-gray-400 mb-1 uppercase tracking-wide">Transport Stop</label>
      {stop && (
        <p className="text-sm text-blue-400 mb-2">Current: {stop.name}</p>
      )}
      <input
        type="text"
        value={query}
        onChange={e => setQuery(e.target.value)}
        placeholder="Search stops (min. 2 characters)..."
        className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
      />
      {loading && (
        <p className="text-xs text-gray-500 mt-1">Searching...</p>
      )}
      {error && (
        <p className="text-xs text-red-400 mt-1">Search failed. Try again.</p>
      )}
      {results.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto bg-gray-700 border border-gray-600 rounded-lg divide-y divide-gray-600">
          {results.map(result => (
            <li key={result.stopId}>
              <button
                onClick={() => handleSelect(result)}
                className="w-full px-3 py-2 text-left text-sm text-gray-200 hover:bg-gray-600 transition-colors"
              >
                {result.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
