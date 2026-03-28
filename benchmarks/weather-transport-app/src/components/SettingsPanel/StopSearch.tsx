import { useState, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';

interface TfNSWStop {
  id: string;
  name: string;
  productClasses: number[];
}

async function searchStops(query: string, signal: AbortSignal): Promise<TfNSWStop[]> {
  const apiKey = import.meta.env.VITE_TFNSW_API_KEY as string | undefined;
  if (!apiKey) return [];

  const url = new URL('https://api.transport.nsw.gov.au/v1/tp/stop_finder');
  url.searchParams.set('outputFormat', 'rapidJSON');
  url.searchParams.set('type_sf', 'any');
  url.searchParams.set('name_sf', query);
  url.searchParams.set('coordOutputFormat', 'EPSG:4326');
  url.searchParams.set('TfNSWSF', 'true');
  url.searchParams.set('version', '10.2.1.42');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `apikey ${apiKey}` },
    signal,
  });
  if (!res.ok) return [];

  interface StopFinderResponse {
    locations?: Array<{
      id?: string;
      name?: string;
      productClasses?: number[];
    }>;
  }
  const json = (await res.json()) as StopFinderResponse;
  return (json.locations ?? [])
    .filter(
      (loc): loc is { id: string; name: string; productClasses?: number[] } =>
        typeof loc.id === 'string' && typeof loc.name === 'string'
    )
    .map((loc) => ({
      id: loc.id,
      name: loc.name,
      productClasses: loc.productClasses ?? [],
    }))
    .slice(0, 10);
}

export function StopSearch() {
  const { state, setStop } = useApp();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TfNSWStop[]>([]);
  const [searching, setSearching] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();
      setSearching(true);
      try {
        const stops = await searchStops(query, abortRef.current.signal);
        setResults(stops);
      } catch {
        // Aborted or network error — silently ignore
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [query]);

  function selectStop(stop: TfNSWStop) {
    setStop({ id: stop.id, name: stop.name, modes: stop.productClasses });
    setQuery('');
    setResults([]);
  }

  return (
    <div>
      <label
        htmlFor="stop-search"
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        Transport Stop
      </label>
      {state.stop && (
        <p className="text-xs text-blue-600 mb-1">Current: {state.stop.name}</p>
      )}
      <input
        id="stop-search"
        type="text"
        placeholder="Type stop name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {searching && (
        <p className="text-xs text-gray-400 mt-1">Searching…</p>
      )}
      {results.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          {results.map((stop) => (
            <li key={stop.id}>
              <button
                onClick={() => selectStop(stop)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
              >
                {stop.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
