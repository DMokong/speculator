import { useState, useEffect } from 'react';
import type { Departure, TransportMode } from '../types';
import { useAppContext } from '../context/AppContext';

interface UseTransportResult {
  departures: Departure[];
  loading: boolean;
  error: boolean;
  missingApiKey: boolean;
}

interface DepartureMon {
  stopEvents?: StopEvent[];
}

interface StopEvent {
  departureTimePlanned: string;
  departureTimeEstimated?: string;
  transportation: {
    number: string;
    destination: { name: string };
    product?: { class: number };
  };
}

const PRODUCT_CLASS_MAP: Record<number, TransportMode> = {
  1: 'train',
  4: 'lightrail',
  5: 'bus',
  7: 'coach',
  9: 'ferry',
  11: 'metro',
};

export function useTransport(): UseTransportResult {
  const { stop, refreshKey, setLastUpdated } = useAppContext();
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [missingApiKey, setMissingApiKey] = useState(false);

  useEffect(() => {
    const apiKey = import.meta.env.VITE_TFNSW_API_KEY as string | undefined;
    if (!apiKey) {
      setLoading(false);
      setMissingApiKey(true);
      setError(true);
      return;
    }

    if (!stop) {
      setDepartures([]);
      setLoading(false);
      setError(false);
      setMissingApiKey(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(false);
    setMissingApiKey(false);

    const url = new URL('/v1/tp/departure_mon', 'https://api.transport.nsw.gov.au');
    url.searchParams.set('outputFormat', 'rapidJSON');
    url.searchParams.set('type_dm', 'stop');
    url.searchParams.set('name_dm', stop.stopId);
    url.searchParams.set('departureMonitorMacro', 'true');
    url.searchParams.set('TfNSWTR', 'true');
    url.searchParams.set('limit', '5');

    fetch(url.toString(), {
      headers: {
        Authorization: `apikey ${apiKey}`,
        'Content-Type': 'application/json',
      },
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json() as Promise<DepartureMon>;
      })
      .then(json => {
        if (cancelled) return;
        const events = json.stopEvents ?? [];
        const mapped: Departure[] = events.slice(0, 5).map(ev => {
          const planned = new Date(ev.departureTimePlanned);
          const estimated = ev.departureTimeEstimated
            ? new Date(ev.departureTimeEstimated)
            : null;
          const isDelayed =
            estimated !== null &&
            estimated.getTime() - planned.getTime() > 60_000;
          const productClass = ev.transportation.product?.class ?? 5;
          const mode: TransportMode = PRODUCT_CLASS_MAP[productClass] ?? 'bus';
          return {
            mode,
            routeNumber: ev.transportation.number,
            destination: ev.transportation.destination.name,
            scheduledDeparture: ev.departureTimePlanned,
            estimatedDeparture: ev.departureTimeEstimated ?? null,
            isDelayed,
          };
        });
        setDepartures(mapped);
        setLastUpdated(new Date());
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setError(true);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [stop, refreshKey, setLastUpdated]);

  return { departures, loading, error, missingApiKey };
}
