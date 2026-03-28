import { useState, useEffect, useRef } from 'react'
import type { SavedStop } from '../../types'
import { useTransport } from '../../hooks/useTransport'

interface Props {
  onSelect: (stop: SavedStop) => void
}

export function StopSearch({ onSelect }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Array<{ id: string; name: string; suburb: string }>>([])
  const [searching, setSearching] = useState(false)
  const [noResults, setNoResults] = useState(false)
  const { searchStops } = useTransport()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length === 0) {
      setResults([])
      setNoResults(false)
      return
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true)
      const found = await searchStops(query)
      setResults(found)
      setNoResults(found.length === 0)
      setSearching(false)
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query, searchStops])

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-1">Transport stop</label>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search stops..."
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
      />
      {searching && (
        <p className="text-xs text-gray-400 mt-1">Searching...</p>
      )}
      {noResults && !searching && (
        <p className="text-xs text-gray-500 mt-1">No stops found for this search</p>
      )}
      {results.length > 0 && !searching && (
        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
          {results.map((stop) => (
            <li key={stop.id}>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-purple-50 transition-colors"
                onClick={() => {
                  onSelect({ id: stop.id, name: stop.name })
                  setQuery('')
                  setResults([])
                }}
              >
                <span className="font-medium">{stop.name}</span>
                {stop.suburb && (
                  <span className="text-gray-400 ml-1">({stop.suburb})</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
