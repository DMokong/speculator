import type { Stop, DepartureEvent, TripOption, TripLeg, RouteLeg, TransportMode } from '../types';
import { diffMinutes } from '../utils/time';

const BASE = 'https://api.transport.nsw.gov.au';

function productClassToMode(cls: number): TransportMode | null {
  switch (cls) {
    case 1: return 'train';
    case 2: return 'metro';
    case 4: return 'tram';
    case 5: return 'bus';
    case 9: return 'ferry';
    default: return null;
  }
}

function headers(apiKey: string): Record<string, string> {
  return { Authorization: `apikey ${apiKey}` };
}

export async function searchStops(query: string, apiKey: string, mode?: TransportMode): Promise<Stop[]> {
  const url = new URL(`${BASE}/v1/tp/stop_finder`);
  url.searchParams.set('outputFormat', 'rapidJSON');
  url.searchParams.set('type_sf', 'stop');
  url.searchParams.set('name_sf', query);
  url.searchParams.set('TfNSWTR', 'true');
  if (mode) {
    const modeCode = { train: '1', metro: '2', tram: '4', bus: '5', ferry: '9' }[mode];
    if (modeCode) url.searchParams.set('modeFilter', modeCode);
  }

  const res = await fetch(url.toString(), { headers: headers(apiKey) });
  if (!res.ok) throw new Error(`Stop search failed: ${res.status}`);

  const data = await res.json() as {
    locations?: Array<{
      id: string;
      name: string;
      coord?: number[];
      productClasses?: number[];
    }>;
  };

  return (data.locations ?? []).slice(0, 10).map(loc => {
    const modes: TransportMode[] = (loc.productClasses ?? [])
      .map(productClassToMode)
      .filter((m): m is TransportMode => m !== null);
    return {
      id: loc.id,
      name: loc.name,
      lat: loc.coord?.[1] ?? 0,
      lon: loc.coord?.[0] ?? 0,
      modes,
    };
  });
}

export async function fetchDepartures(stopId: string, apiKey: string): Promise<DepartureEvent[]> {
  const url = new URL(`${BASE}/v1/tp/departure_mon`);
  url.searchParams.set('outputFormat', 'rapidJSON');
  url.searchParams.set('coordOutputFormat', 'EPSG:4326');
  url.searchParams.set('mode', 'direct');
  url.searchParams.set('type_dm', 'stop');
  url.searchParams.set('name_dm', stopId);
  url.searchParams.set('departureMonitorMacro', 'true');
  url.searchParams.set('TfNSWDM', 'true');
  url.searchParams.set('version', '10.2.1.42');

  const res = await fetch(url.toString(), { headers: headers(apiKey) });
  if (!res.ok) throw new Error(`Departures fetch failed: ${res.status}`);

  const data = await res.json() as {
    stopEvents?: Array<{
      departureTimePlanned: string;
      departureTimeEstimated?: string;
      transportation?: {
        number?: string;
        destination?: { name?: string };
        product?: { class?: number };
      };
    }>;
  };

  return (data.stopEvents ?? []).map((ev, i) => {
    const planned = ev.departureTimePlanned;
    const realtime = ev.departureTimeEstimated ?? null;
    const delay = realtime ? diffMinutes(planned, realtime) : 0;
    const productClass = ev.transportation?.product?.class ?? 0;
    const mode = productClassToMode(productClass) ?? 'bus';
    return {
      departureId: `${stopId}-${i}`,
      stopId,
      plannedDepartureISO: planned,
      realtimeDepartureISO: realtime,
      isDelayed: realtime !== null && delay > 0,
      delayMinutes: Math.round(Math.max(0, delay)),
      headsign: ev.transportation?.destination?.name ?? '',
      lineNumber: ev.transportation?.number ?? '',
      mode,
    };
  });
}

export async function fetchTripOptions(
  originStopId: string,
  destStopId: string,
  depDate: string,
  depTime: string,
  apiKey: string
): Promise<TripOption[]> {
  const url = new URL(`${BASE}/v1/tp/trip`);
  url.searchParams.set('outputFormat', 'rapidJSON');
  url.searchParams.set('coordOutputFormat', 'EPSG:4326');
  url.searchParams.set('type_origin', 'stop');
  url.searchParams.set('name_origin', originStopId);
  url.searchParams.set('type_destination', 'stop');
  url.searchParams.set('name_destination', destStopId);
  url.searchParams.set('depArrMacro', 'dep');
  url.searchParams.set('itdDate', depDate);
  url.searchParams.set('itdTime', depTime);
  url.searchParams.set('TfNSWTR', 'true');
  url.searchParams.set('version', '10.2.1.42');
  url.searchParams.set('numOfJourneys', '5');

  const res = await fetch(url.toString(), { headers: headers(apiKey) });
  if (!res.ok) throw new Error(`Trip fetch failed: ${res.status}`);

  const data = await res.json() as {
    journeys?: Array<{
      legs?: Array<{
        origin?: { departureTimePlanned?: string; departureTimeEstimated?: string; name?: string };
        destination?: { arrivalTimePlanned?: string; name?: string };
        transportation?: { number?: string; destination?: { name?: string }; product?: { class?: number } };
        stopSequence?: Array<{ id?: string }>;
      }>;
    }>;
  };

  const journeys = data.journeys ?? [];
  return journeys.map(journey => {
    const legs = journey.legs ?? [];
    const tripLegs: TripLeg[] = legs.map((leg, legIdx) => {
      const planned = leg.origin?.departureTimePlanned ?? new Date().toISOString();
      const realtime = leg.origin?.departureTimeEstimated ?? null;
      const delay = realtime ? diffMinutes(planned, realtime) : 0;
      const arrivalISO = leg.destination?.arrivalTimePlanned ?? planned;
      const productClass = leg.transportation?.product?.class ?? 0;
      const mode = productClassToMode(productClass) ?? 'bus';

      const nextLeg = legs[legIdx + 1];
      const transferMinutes = nextLeg
        ? diffMinutes(arrivalISO, nextLeg.origin?.departureTimePlanned ?? arrivalISO)
        : null;

      const routeLeg: RouteLeg = {
        id: `tl-${legIdx}`,
        originStopId: leg.stopSequence?.[0]?.id ?? '',
        destinationStopId: leg.stopSequence?.[leg.stopSequence.length - 1]?.id ?? '',
        mode,
      };

      const departure: DepartureEvent = {
        departureId: `trip-${legIdx}`,
        stopId: routeLeg.originStopId,
        plannedDepartureISO: planned,
        realtimeDepartureISO: realtime,
        isDelayed: realtime !== null && delay > 0,
        delayMinutes: Math.round(Math.max(0, delay)),
        headsign: leg.transportation?.destination?.name ?? '',
        lineNumber: leg.transportation?.number ?? '',
        mode,
      };

      return {
        routeLeg,
        departure,
        arrivalISO,
        transferMinutesToNext: transferMinutes !== null ? Math.round(transferMinutes) : null,
        transferAtRisk: transferMinutes !== null && transferMinutes < 5,
      };
    });

    const lastLeg = tripLegs[tripLegs.length - 1];
    const arrivalISO = lastLeg?.arrivalISO ?? new Date().toISOString();
    const firstDep = tripLegs[0]?.departure.plannedDepartureISO ?? arrivalISO;
    const totalDurationMinutes = Math.round(diffMinutes(firstDep, arrivalISO));

    return {
      legs: tripLegs,
      totalDurationMinutes,
      arrivalISO,
      feasible: tripLegs.length > 0,
    };
  });
}
