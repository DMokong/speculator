import type { SavedRoute, TripOption, Stop } from '../types';
import { fetchDepartures, fetchTripOptions } from '../api/tfnsw';
import { toYYYYMMDD, toHHmm } from './time';

export async function computeTripOptions(
  route: SavedRoute,
  _stops: Stop[],
  apiKey: string,
  now = new Date()
): Promise<TripOption[]> {
  if (route.legs.length === 0) return [];

  const firstLeg = route.legs[0];
  if (!firstLeg) return [];

  // Fetch departures from origin of first leg
  const departures = await fetchDepartures(firstLeg.originStopId, apiKey);
  const upcoming = departures
    .filter(d => new Date(d.realtimeDepartureISO ?? d.plannedDepartureISO) >= now)
    .slice(0, 3); // limit to 3 candidate departures

  if (upcoming.length === 0) return [];

  const results: TripOption[] = [];

  // For routes with a single leg, use trip API directly
  if (route.legs.length === 1) {
    const lastLeg = route.legs[route.legs.length - 1];
    if (!lastLeg) return [];
    const date = toYYYYMMDD(now);
    const time = toHHmm(now);
    const options = await fetchTripOptions(
      firstLeg.originStopId,
      lastLeg.destinationStopId,
      date,
      time,
      apiKey
    );
    return options.slice(0, 5);
  }

  // Multi-leg routes: validate leg by leg
  for (const dep of upcoming) {
    const depTime = new Date(dep.realtimeDepartureISO ?? dep.plannedDepartureISO);
    const lastLeg = route.legs[route.legs.length - 1];
    if (!lastLeg) continue;

    const options = await fetchTripOptions(
      firstLeg.originStopId,
      lastLeg.destinationStopId,
      toYYYYMMDD(depTime),
      toHHmm(depTime),
      apiKey
    );

    // Filter options that cover all legs of our saved route
    for (const opt of options) {
      const allTransfersOk = opt.legs.every(
        leg => leg.transferMinutesToNext === null || leg.transferMinutesToNext >= 2
      );
      results.push({ ...opt, feasible: allTransfersOk });
    }

    if (results.length >= 5) break;
  }

  return results
    .sort((a, b) => new Date(a.arrivalISO).getTime() - new Date(b.arrivalISO).getTime())
    .slice(0, 5);
}
