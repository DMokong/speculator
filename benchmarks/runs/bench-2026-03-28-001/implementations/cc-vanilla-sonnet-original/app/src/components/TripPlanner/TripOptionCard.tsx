import type { TripOption, ServiceAdvisory } from '../../types';
import { getModeInfo } from '../../data/transportModes';
import { formatTime } from '../../utils/time';

interface Props {
  option: TripOption;
  advisories: ServiceAdvisory[];
}

export default function TripOptionCard({ option, advisories }: Props) {
  const firstLeg = option.legs[0];
  if (!firstLeg) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      {/* Header: departure → arrival */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-2xl font-bold text-gray-900">
            {formatTime(firstLeg.departure.realtimeDepartureISO ?? firstLeg.departure.plannedDepartureISO)}
          </p>
          {firstLeg.departure.isDelayed && (
            <p className="text-xs text-red-600 font-medium">
              +{firstLeg.departure.delayMinutes} min delay
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">→ {formatTime(option.arrivalISO)}</p>
          <p className="text-xs text-gray-400">{option.totalDurationMinutes} min total</p>
        </div>
      </div>

      {/* Legs */}
      <div className="space-y-2">
        {option.legs.map((leg, i) => {
          const modeInfo = getModeInfo(leg.routeLeg.mode);
          const hasAdvisory = advisories.some(a =>
            a.affectedStopIds.includes(leg.routeLeg.originStopId) ||
            a.affectedStopIds.includes(leg.routeLeg.destinationStopId)
          );
          return (
            <div key={i}>
              <div className="flex items-center gap-2">
                <span className="text-xl">{modeInfo.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${modeInfo.color}`}>
                      {leg.departure.lineNumber || modeInfo.label}
                    </span>
                    <span className="text-xs text-gray-500 truncate">{leg.departure.headsign}</span>
                    {hasAdvisory && (
                      <span className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded-full">Alert</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{formatTime(leg.departure.plannedDepartureISO)}</span>
                    {leg.departure.isDelayed && (
                      <span className="text-red-600 font-medium">+{leg.departure.delayMinutes} min</span>
                    )}
                    <span>→ {formatTime(leg.arrivalISO)}</span>
                  </div>
                </div>
              </div>
              {leg.transferMinutesToNext !== null && (
                <div className={`ml-8 mt-1 text-xs flex items-center gap-1 ${
                  leg.transferAtRisk ? 'text-red-600 font-medium' : 'text-gray-500'
                }`}>
                  {leg.transferAtRisk && <span>⚠️</span>}
                  <span>Transfer — {leg.transferMinutesToNext} min</span>
                  {leg.transferAtRisk && <span>(tight connection)</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!option.feasible && (
        <p className="text-xs text-red-600 bg-red-50 rounded px-2 py-1">
          ⚠️ Transfer connection may be too tight
        </p>
      )}
    </div>
  );
}
