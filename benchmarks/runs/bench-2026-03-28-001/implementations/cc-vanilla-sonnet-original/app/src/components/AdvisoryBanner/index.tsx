import { useState } from 'react';
import { useApp } from '../../context/AppContext';

export default function AdvisoryBanner() {
  const { state } = useApp();
  const [expanded, setExpanded] = useState(false);

  // Filter to advisories affecting user's saved route stops
  const allStopIds = new Set(
    state.savedRoutes.flatMap(r => r.legs.flatMap(l => [l.originStopId, l.destinationStopId]))
  );
  const relevant = state.advisories.filter(a =>
    a.affectedStopIds.some(id => allStopIds.has(id)) ||
    a.affectedRouteIds.length > 0
  );

  if (relevant.length === 0) return null;

  const effectColors: Record<string, string> = {
    NO_SERVICE: 'bg-red-100 text-red-800',
    REDUCED_SERVICE: 'bg-orange-100 text-orange-800',
    DELAY: 'bg-yellow-100 text-yellow-800',
  };

  return (
    <div className="bg-orange-50 border-b border-orange-200">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-4 py-3 flex items-center justify-between text-left min-h-[44px]"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-orange-800">
          <span>⚠️</span>
          <span>{relevant.length} service {relevant.length === 1 ? 'advisory' : 'advisories'} affecting your routes</span>
        </span>
        <span className="text-orange-600">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 space-y-2">
          {relevant.map(adv => {
            const affectedRoutes = state.savedRoutes.filter(r =>
              r.legs.some(l =>
                adv.affectedStopIds.includes(l.originStopId) ||
                adv.affectedStopIds.includes(l.destinationStopId)
              )
            );
            const colorClass = effectColors[adv.effect] ?? 'bg-gray-100 text-gray-800';
            return (
              <div key={adv.id} className="bg-white rounded-lg p-3 border border-orange-100">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-medium text-gray-900">{adv.header}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0 ${colorClass}`}>
                    {adv.effect.replace(/_/g, ' ')}
                  </span>
                </div>
                {adv.description && (
                  <p className="text-xs text-gray-600 mt-1 line-clamp-2">{adv.description}</p>
                )}
                {affectedRoutes.length > 0 && (
                  <p className="text-xs text-orange-700 mt-1">
                    Affects: {affectedRoutes.map(r => r.name).join(', ')}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
