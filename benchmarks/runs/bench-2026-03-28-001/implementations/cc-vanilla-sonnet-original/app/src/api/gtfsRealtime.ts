import { transit_realtime } from 'gtfs-realtime-bindings';
import type { ServiceAdvisory } from '../types';

const BASE = 'https://api.transport.nsw.gov.au/v1/gtfs/alerts';
const FEEDS = ['sydneytrains', 'buses', 'lightrail', 'ferries', 'metro'] as const;

async function fetchFeed(feed: string, apiKey: string): Promise<ServiceAdvisory[]> {
  const res = await fetch(`${BASE}/${feed}`, {
    headers: { Authorization: `apikey ${apiKey}` },
  });
  if (!res.ok) throw new Error(`GTFS alert fetch failed for ${feed}: ${res.status}`);

  const buffer = await res.arrayBuffer();
  const message = transit_realtime.FeedMessage.decode(new Uint8Array(buffer));

  const advisories: ServiceAdvisory[] = [];
  for (const entity of message.entity) {
    const alert = entity.alert;
    if (!alert) continue;

    const affectedStopIds = (alert.informedEntity ?? [])
      .map(e => e.stopId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const affectedRouteIds = (alert.informedEntity ?? [])
      .map(e => e.routeId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0);

    const period = alert.activePeriod?.[0];

    advisories.push({
      id: entity.id,
      header: alert.headerText?.translation?.[0]?.text ?? '',
      description: alert.descriptionText?.translation?.[0]?.text ?? '',
      effect: alert.effect?.toString() ?? 'UNKNOWN',
      affectedStopIds,
      affectedRouteIds,
      activePeriodStart: typeof period?.start === 'number' ? period.start : Number(period?.start ?? 0),
      activePeriodEnd: period?.end != null ? (typeof period.end === 'number' ? period.end : Number(period.end)) : null,
    });
  }
  return advisories;
}

export async function fetchAllAdvisories(apiKey: string): Promise<ServiceAdvisory[]> {
  const results = await Promise.allSettled(FEEDS.map(feed => fetchFeed(feed, apiKey)));
  const advisories: ServiceAdvisory[] = [];
  for (const result of results) {
    if (result.status === 'fulfilled') {
      advisories.push(...result.value);
    }
  }
  return advisories;
}
