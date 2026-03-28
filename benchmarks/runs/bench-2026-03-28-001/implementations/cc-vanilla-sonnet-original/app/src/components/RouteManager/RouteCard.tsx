import type { SavedRoute } from '../../types';
import { getModeInfo } from '../../data/transportModes';
import { useApp } from '../../context/AppContext';

interface Props {
  route: SavedRoute;
  onEdit: () => void;
  onPlanTrip: () => void;
}

export default function RouteCard({ route, onEdit, onPlanTrip }: Props) {
  const { dispatch } = useApp();

  const summary = route.legs.map(leg => {
    const mode = getModeInfo(leg.mode);
    return `${mode.icon} ${mode.label} (Leg ${route.legs.indexOf(leg) + 1})`;
  }).join(' → ');

  function handleDelete() {
    if (confirm(`Delete route "${route.name}"?`)) {
      dispatch({ type: 'DELETE_ROUTE', routeId: route.id });
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 truncate">{route.name}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate">{summary}</p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          <button
            onClick={onEdit}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Edit route"
          >
            ✏️
          </button>
          <button
            onClick={handleDelete}
            className="p-2 rounded-lg hover:bg-red-50 text-red-500 min-h-[44px] min-w-[44px] flex items-center justify-center"
            aria-label="Delete route"
          >
            🗑️
          </button>
        </div>
      </div>
      <button
        onClick={onPlanTrip}
        className="w-full bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium hover:bg-blue-700 min-h-[44px]"
      >
        Plan trip
      </button>
    </div>
  );
}
