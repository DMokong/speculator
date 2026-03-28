---
id: PRD-001
name: "Smart Commuter — Weather-Aware Route Planner"
version: 2.0
difficulty: hard
estimated_features: 28
estimated_impl_time: 240min
---

# PRD: Smart Commuter — Weather-Aware Route Planner

## Purpose

A single-page web app for NSW commuters that plans multi-leg public transport journeys with real-time departure matching, transfer feasibility, weather-aware delay recommendations, service advisory integration, and learned user behavior patterns. Not just "what's the next bus" — this answers "what should I catch right now to make my full journey, given the weather and service alerts?"

## Tech Stack (Constrained)

| Component | Choice |
|-----------|--------|
| Build tool | Vite |
| Framework | React |
| Language | TypeScript |
| Styling | Tailwind CSS |

No other frameworks or UI libraries. No backend — all API calls from the browser.

## Data Sources

- **Weather**: Open-Meteo free API (no key required). Use the BOM ACCESS-G model for Australian accuracy.
- **Transport**: TfNSW Open Data Hub (requires API key via header). Supports stop search, departure monitoring, and trip planning.
- **Service Advisories**: TfNSW GTFS-realtime alerts feed for disruptions, track work, and service changes.

## Requirements

### Weather

**R01**: Show current temperature in °C, "feels like" temperature, and wind speed in km/h for the user's location.

**R02**: Show a 5-day forecast with day labels, high/low temps, and weather condition icons.

### Route Management

**R03**: Allow users to save any number of named routes. A route consists of one or more legs. Each leg has an origin stop, a destination stop, and a transport mode (train, metro, tram, ferry). Routes are persisted in the browser across sessions.

**R04**: Provide a route builder UI where the user selects stops and transport modes for each leg. When a user selects a stop, filter available destinations and transfer stops to only those reachable by the selected mode from that stop — disconnected or unreachable stops should not appear as options.

**R05**: Support multi-leg/transfer routes. For example: Train from Hornsby to Chatswood, transfer to Metro from Chatswood to Martin Place. The user builds this leg by leg.

**R06**: Provide a UI to browse and search stops filtered by transport type (train stations, metro stations, tram stops, ferry wharves). Searching or selecting a type should narrow the visible stops accordingly.

### Real-Time Trip Planning

**R07**: Given a saved route and the current time, show all feasible departure options the user could take right now. A feasible option is one where the user can board the first leg's departure and make each subsequent transfer in time.

**R08**: For each trip option, show: departure time for each leg, transfer wait time at each interchange, and estimated arrival time at the final destination.

**R09**: For each departure in a trip option, indicate whether it's on time or delayed based on real-time data.

**R10**: For transfer points, show how much time the user has to make the transfer. Highlight transfers that are tight (under 5 minutes) or at risk.

### Weather-Aware Recommendations

**R11**: When current or forecast weather includes heavy rain or thunderstorms with >60% probability, display a recommendation suggesting the user take an earlier departure to account for likely delays.

**R12**: Consider the weather conditions at the locations along the route — not just the user's home location. If severe weather is localised to part of the route, flag that segment specifically.

### Service Advisories

**R13**: Fetch and display active service advisories (disruptions, track work, delays) from TfNSW that affect any leg of the user's saved routes.

**R14**: Correlate advisories with the user's route — show which specific legs or stops are impacted, not just a generic alert list.

### Behaviour Learning

**R15**: Track the user's trip-checking patterns over time (what times they typically check, which routes, which days). Use this data to surface proactive recommendations like "You usually leave around 7:45am — here are today's options."

**R16**: Support app notifications (browser Notification API) to alert the user when it's time to leave based on their learned patterns, or when a disruption affects their usual route.

### Personalisation & Persistence

**R17**: Persist all user preferences, saved routes, and behavior data in browser persistent storage (localStorage or IndexedDB) so everything survives across sessions and reloads.

**R18**: Show a time-of-day greeting in the header.

### UI & Behaviour

**R19**: Responsive layout — mobile-first, stacked on narrow screens, side-by-side panels on desktop.

**R20**: Auto-refresh transport and advisory data periodically. Include a manual refresh button with a "Last updated" timestamp.

---

<!--
REVIEW ONLY: Do not include in spec generator prompts.

## Implied Requirements (Review Reference Only)

These requirements are NOT shown to spec generators. A high-quality spec should discover and address these independently. They are used during LLM-as-judge review to assess spec depth.

- **IR01: Loading states** — Route planning involves multiple chained API calls (departures for each leg, alerts, weather per location). Show loading states per-panel and per-leg, not just a single global spinner.

- **IR02: Transfer feasibility edge cases** — What happens when a transfer is impossible (last service has departed, service cancelled)? The trip option should be marked as infeasible rather than silently omitted. What about overnight gaps?

- **IR03: API key management UX** — The TfNSW API requires an API key. The app needs a clear way for users to enter/update their key, with specific error messaging when the key is missing, invalid, or rate-limited.

- **IR04: Rate limiting** — Multiple concurrent requests to TfNSW (departure lookups for each leg, stop finder, alerts) could easily trigger rate limits. Requests should be serialised or throttled.

- **IR05: Timezone handling** — All displayed times must be in AEST/AEDT (Australia/Sydney), not the browser's local timezone. This matters for users traveling or using VPNs.

- **IR06: Route validation** — When building a route, what prevents a user from creating a route with disconnected legs (e.g., leg 1 ends at Chatswood but leg 2 starts at Parramatta)? The origin of each subsequent leg should default to or be constrained by the destination of the previous leg.

- **IR07: Stale behavior data** — Learned patterns from weeks ago may no longer be relevant (changed job, moved house). There should be a decay mechanism or a way for users to reset their patterns.

- **IR08: Notification permissions** — Browser notifications require explicit user permission. The app must handle the permission request gracefully, including the case where the user denies or has previously denied permission.

- **IR09: Offline/degraded mode** — If the device is offline, the app should still show saved routes and last-known data rather than a blank screen. Indicate clearly that data is stale.

- **IR10: Accessibility** — Complex UIs (route builder, multi-leg trip display, cascading filters) need keyboard navigation, screen reader support, and WCAG AA colour contrast.

- **IR11: Data staleness indicator** — If transport data hasn't refreshed in over 10 minutes (background tab, network loss), display a visible warning.

- **IR12: Empty/first-run state** — On first launch with no routes saved, guide the user through creating their first route rather than showing an empty dashboard.
-->
