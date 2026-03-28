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
  id: string;
  name: string;
  modes: TransportMode[];
}

interface StopFinderLocation {
  id: string;
  name: string;
  productClasses?: number[];
}

interface StopFinderResponse {
  locations?: StopFinderLocation[];
}

export function StopSearch() {
  const { stop, setStop } = useAppContext();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<StopResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      setSearchError(false);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);

    timerRef.current = setTimeout(() => {
      const apiKey = import.meta.env.VITE_TFNSW_API_KEY as string | undefined;
      if (!apiKey) {
        setSearchError(true);
        return;
      }

      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setSearchError(false);

      const url = new URL(
        '/v1/tp/stop_finder',
        'https://api.transport.nsw.gov.au'
      );
      url.searchParams.set('outputFormat', 'rapidJSON');
      url.searchParams.set('type_sf', 'stop');
      url.searchParams.set('name_sf', query);
      url.searchParams.set('TfNSWTR', 'true');

      fetch(url.toString(), {
        headers: {
          Authorization: `apikey ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      })
        .then(res => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json() as Promise<StopFinderResponse>;
        })
        .then(json => {
          if (controller.signal.aborted) return;
          const locs = json.locations ?? [];
          const mapped: StopResult[] = locs.slice(0, 10).map(loc => ({
            id: loc.id,
            name: loc.name,
            modes: (loc.productClasses ?? [])
              .map(c => PRODUCT_CLASS_MAP[c])
              .filter((m): m is TransportMode => m !== undefined),
          }));
          setResults(mapped);
          setLoading(false);
        })
        .catch(err => {
          if (err instanceof DOMException && err.name === 'AbortError') return;
          setSearchError(true);
          setLoading(false);
        });
    }, 400);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [query]);

  const handleSelect = (result: StopResult) => {
    const s: SavedStop = {
      stopId: result.id,
      name: result.name,
      modes: result.modes,
    };
    setStop(s);
    setQuery('');
    setResults([]);
  };

  return (
    <div>
      <label
        htmlFor="stop-search"
        className="block text-sm font-medium text-gray-300 mb-1"
      >
        Transport Stop
      </label>
      <input
        id="stop-search"
        type="text"
        placeholder="Search stop (min 2 chars)..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
      />
      {stop && !query && (
        <p className="text-xs text-green-400 mt-1">Current: {stop.name}</p>
      )}
      {loading && (
        <p className="text-xs text-gray-400 mt-1">Searching...</p>
      )}
      {searchError && (
        <p className="text-xs text-red-400 mt-1">
          Search failed. Check API key in .env.local.
        </p>
      )}
      {results.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto bg-gray-700 rounded-lg divide-y divide-gray-600">
          {results.map(r => (
            <li key={r.id}>
              <button
                onClick={() => handleSelect(r)}
                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-600 transition-colors"
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
