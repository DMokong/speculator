import { useAppContext } from '../../context/AppContext'
import { setLocation as saveLocation, setStop as saveStop } from '../../utils/localStorage'
import type { SavedLocation, SavedStop } from '../../types'
import { LocationSearch } from './LocationSearch'
import { StopSearch } from './StopSearch'

interface Props {
  onWeatherRefresh: () => void
  onTransportRefresh: () => void
}

export function SettingsPanel({ onWeatherRefresh, onTransportRefresh }: Props) {
  const { state, dispatch, setLocation, setStop } = useAppContext()

  function handleSelectLocation(loc: SavedLocation) {
    saveLocation(loc)
    setLocation(loc)
    dispatch({ type: 'CLOSE_SETTINGS' })
    onWeatherRefresh()
  }

  function handleSelectStop(stop: SavedStop) {
    saveStop(stop)
    setStop(stop)
    dispatch({ type: 'CLOSE_SETTINGS' })
    onTransportRefresh()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl shadow-lg p-5 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-800">Settings</h2>
        <button
          onClick={() => dispatch({ type: 'CLOSE_SETTINGS' })}
          className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          aria-label="Close settings"
        >
          ×
        </button>
      </div>
      {state.location && (
        <p className="text-xs text-gray-500">Current location: <strong>{state.location.name}</strong></p>
      )}
      <LocationSearch onSelect={handleSelectLocation} />
      {state.stop && (
        <p className="text-xs text-gray-500">Current stop: <strong>{state.stop.name}</strong></p>
      )}
      <StopSearch onSelect={handleSelectStop} />
    </div>
  )
}
