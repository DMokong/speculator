import { useState } from 'react';
import { SUBURBS, type Suburb } from '../../data/suburbs';
import { useAppContext } from '../../context/AppContext';
import type { SavedLocation } from '../../types';

export function LocationSearch() {
  const { location, setLocation } = useAppContext();
  const [query, setQuery] = useState('');

  const filtered: Suburb[] =
    query.length >= 1
      ? SUBURBS.filter(s =>
          s.name.toLowerCase().includes(query.toLowerCase())
        )
      : SUBURBS;

  const handleSelect = (suburb: Suburb) => {
    const loc: SavedLocation = {
      name: suburb.name,
      lat: suburb.lat,
      lng: suburb.lng,
    };
    setLocation(loc);
    setQuery('');
  };

  return (
    <div>
      <label
        htmlFor="location-search"
        className="block text-sm font-medium text-gray-300 mb-1"
      >
        Location
      </label>
      <input
        id="location-search"
        type="text"
        placeholder="Search suburb..."
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 placeholder-gray-500"
      />
      {location && !query && (
        <p className="text-xs text-green-400 mt-1">Current: {location.name}</p>
      )}
      {query.length >= 1 && (
        <ul className="mt-1 max-h-48 overflow-y-auto bg-gray-700 rounded-lg divide-y divide-gray-600">
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-gray-400">No results</li>
          )}
          {filtered.map(s => (
            <li key={s.name}>
              <button
                onClick={() => handleSelect(s)}
                className="w-full text-left px-3 py-2 text-sm text-white hover:bg-gray-600 transition-colors"
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
