import { useState } from 'react';
import { NSW_SUBURBS, type Suburb } from '../../data/suburbs';
import { useApp } from '../../context/AppContext';

export function LocationSearch() {
  const { state, setLocation } = useApp();
  const [query, setQuery] = useState('');

  const filtered =
    query.length >= 2
      ? NSW_SUBURBS.filter((s) =>
          s.name.toLowerCase().includes(query.toLowerCase())
        ).slice(0, 10)
      : [];

  function selectSuburb(suburb: Suburb) {
    setLocation({ name: suburb.name, lat: suburb.lat, lon: suburb.lon });
    setQuery('');
  }

  return (
    <div>
      <label
        htmlFor="location-search"
        className="block text-sm font-medium text-gray-700 mb-1"
      >
        Location
      </label>
      {state.location && (
        <p className="text-xs text-blue-600 mb-1">Current: {state.location.name}</p>
      )}
      <input
        id="location-search"
        type="text"
        placeholder="Type suburb name…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {filtered.length > 0 && (
        <ul className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-sm">
          {filtered.map((suburb) => (
            <li key={suburb.name}>
              <button
                onClick={() => selectSuburb(suburb)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 focus:bg-blue-50 focus:outline-none"
              >
                {suburb.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
