import { useState } from 'react'
import { suburbs } from '../../data/suburbs'
import type { SavedLocation } from '../../types'

interface Props {
  onSelect: (loc: SavedLocation) => void
}

export function LocationSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('')

  const filtered = query.trim().length > 0
    ? suburbs.filter((s) => s.name.toLowerCase().includes(query.toLowerCase())).slice(0, 10)
    : []

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search NSW suburb..."
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      {filtered.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {filtered.map((suburb) => (
            <li key={suburb.name}>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors"
                onClick={() => {
                  onSelect({ name: suburb.name, lat: suburb.lat, lon: suburb.lon })
                  setQuery('')
                }}
              >
                {suburb.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
