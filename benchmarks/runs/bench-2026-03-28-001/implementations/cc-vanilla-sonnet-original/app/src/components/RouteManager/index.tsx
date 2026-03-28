import { useState } from 'react';
import { useApp } from '../../context/AppContext';
import RouteCard from './RouteCard';
import RouteBuilder from '../RouteBuilder';
import type { SavedRoute } from '../../types';

interface Props {
  onClose?: () => void;
}

export default function RouteManager({ onClose }: Props) {
  const { state, dispatch } = useApp();
  const [showBuilder, setShowBuilder] = useState(false);
  const [editRoute, setEditRoute] = useState<SavedRoute | null>(null);

  function handlePlanTrip(routeId: string) {
    dispatch({ type: 'SET_ACTIVE_ROUTE', routeId });
    onClose?.();
  }

  return (
    <>
      <div className="h-full flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">My Routes</h2>
          {onClose && (
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 min-h-[44px] min-w-[44px] flex items-center justify-center">✕</button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {state.savedRoutes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500 text-sm mb-3">No routes saved yet.</p>
              <p className="text-gray-400 text-xs">Add a route to get started.</p>
            </div>
          ) : (
            state.savedRoutes.map(route => (
              <RouteCard
                key={route.id}
                route={route}
                onEdit={() => setEditRoute(route)}
                onPlanTrip={() => handlePlanTrip(route.id)}
              />
            ))
          )}
        </div>
        <div className="p-4 border-t">
          <button
            onClick={() => setShowBuilder(true)}
            className="w-full bg-blue-600 text-white rounded-lg py-3 font-medium hover:bg-blue-700 min-h-[44px]"
          >
            + New route
          </button>
        </div>
      </div>
      {showBuilder && <RouteBuilder onClose={() => setShowBuilder(false)} />}
      {editRoute && <RouteBuilder existing={editRoute} onClose={() => setEditRoute(null)} />}
    </>
  );
}
