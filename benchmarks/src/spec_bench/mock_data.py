"""
Deterministic mock API responses for spec-bench test harness.

Data narrative: thunderstorm evening in Hornsby, train delays on T1 North Shore Line,
signal failure advisory affecting Gordon–Chatswood corridor.
"""

import json

# ---------------------------------------------------------------------------
# Open-Meteo: current conditions
# ---------------------------------------------------------------------------

OPEN_METEO_CURRENT = {
    "latitude": -33.7033,
    "longitude": 151.0983,
    "generationtime_ms": 0.452,
    "utc_offset_seconds": 36000,
    "timezone": "Australia/Sydney",
    "timezone_abbreviation": "AEST",
    "elevation": 72.0,
    "current_units": {
        "time": "iso8601",
        "interval": "seconds",
        "temperature_2m": "°C",
        "apparent_temperature": "°C",
        "weather_code": "wmo code",
        "wind_speed_10m": "km/h",
        "wind_direction_10m": "°",
        "relative_humidity_2m": "%",
        "precipitation": "mm",
    },
    "current": {
        "time": "2026-03-29T19:00",
        "interval": 900,
        "temperature_2m": 18.5,
        "apparent_temperature": 16.2,
        "weather_code": 95,
        "wind_speed_10m": 28.4,
        "wind_direction_10m": 215,
        "relative_humidity_2m": 82,
        "precipitation": 1.4,
    },
}

# ---------------------------------------------------------------------------
# Open-Meteo: 5-day forecast
# ---------------------------------------------------------------------------

OPEN_METEO_FORECAST = {
    "latitude": -33.7033,
    "longitude": 151.0983,
    "generationtime_ms": 1.204,
    "utc_offset_seconds": 36000,
    "timezone": "Australia/Sydney",
    "timezone_abbreviation": "AEST",
    "elevation": 72.0,
    "daily_units": {
        "time": "iso8601",
        "weather_code": "wmo code",
        "temperature_2m_max": "°C",
        "temperature_2m_min": "°C",
        "precipitation_probability_max": "%",
        "wind_speed_10m_max": "km/h",
    },
    "daily": {
        "time": [
            "2026-03-29",
            "2026-03-30",
            "2026-03-31",
            "2026-04-01",
            "2026-04-02",
        ],
        "weather_code": [95, 61, 3, 2, 1],
        "temperature_2m_max": [21.3, 19.8, 23.1, 25.4, 26.0],
        "temperature_2m_min": [15.2, 14.9, 15.8, 16.3, 17.1],
        "precipitation_probability_max": [90, 65, 15, 5, 0],
        "wind_speed_10m_max": [31.2, 22.7, 14.3, 11.8, 9.5],
    },
}

# ---------------------------------------------------------------------------
# TfNSW: Stop Finder — Hornsby, Chatswood, Martin Place
# ---------------------------------------------------------------------------

TFNSW_STOP_FINDER_HORNSBY = {
    "version": "10.2.15.18",
    "locations": [
        {
            "id": "10101124",
            "name": "Hornsby Station",
            "disassembledName": "Hornsby",
            "type": "stop",
            "coord": [-33.703298, 151.098289],
            "parent": {
                "id": "2000441",
                "name": "Hornsby",
                "type": "locality",
            },
            "modes": [1],
            "stopType": "platform",
            "properties": {
                "stopId": "2000441",
                "area": "Hornsby",
            },
        },
        {
            "id": "10101282",
            "name": "Chatswood Station",
            "disassembledName": "Chatswood",
            "type": "stop",
            "coord": [-33.796894, 151.181877],
            "parent": {
                "id": "2000325",
                "name": "Chatswood",
                "type": "locality",
            },
            "modes": [1, 4],
            "stopType": "platform",
            "properties": {
                "stopId": "2000325",
                "area": "Chatswood",
            },
        },
        {
            "id": "10101331",
            "name": "Martin Place Station",
            "disassembledName": "Martin Place",
            "type": "stop",
            "coord": [-33.867952, 151.211573],
            "parent": {
                "id": "2000260",
                "name": "Martin Place",
                "type": "locality",
            },
            "modes": [4],
            "stopType": "platform",
            "properties": {
                "stopId": "2000260",
                "area": "Sydney CBD",
            },
        },
    ],
}

# ---------------------------------------------------------------------------
# TfNSW: Departures from Hornsby — T1 to Central, some delayed
# ---------------------------------------------------------------------------

TFNSW_DEPARTURES_HORNSBY = {
    "version": "10.2.15.18",
    "stopEvents": [
        {
            "location": {
                "id": "10101124",
                "name": "Hornsby Station",
                "type": "stop",
            },
            "departureTimePlanned": "2026-03-29T19:05:00+10:00",
            "departureTimeEstimated": None,
            "isRealtimeControlled": True,
            "transportation": {
                "id": "T1-001",
                "name": "T1 North Shore & Western",
                "disassembledName": "T1",
                "number": "T1",
                "iconId": 1,
                "destination": {
                    "id": "2000153",
                    "name": "Central Station",
                },
                "operator": {
                    "id": "SydneyTrains",
                    "name": "Sydney Trains",
                },
            },
        },
        {
            "location": {
                "id": "10101124",
                "name": "Hornsby Station",
                "type": "stop",
            },
            "departureTimePlanned": "2026-03-29T19:15:00+10:00",
            "departureTimeEstimated": "2026-03-29T19:18:00+10:00",
            "isRealtimeControlled": True,
            "transportation": {
                "id": "T1-002",
                "name": "T1 North Shore & Western",
                "disassembledName": "T1",
                "number": "T1",
                "iconId": 1,
                "destination": {
                    "id": "2000153",
                    "name": "Central Station",
                },
                "operator": {
                    "id": "SydneyTrains",
                    "name": "Sydney Trains",
                },
            },
        },
        {
            "location": {
                "id": "10101124",
                "name": "Hornsby Station",
                "type": "stop",
            },
            "departureTimePlanned": "2026-03-29T19:25:00+10:00",
            "departureTimeEstimated": None,
            "isRealtimeControlled": True,
            "transportation": {
                "id": "T1-003",
                "name": "T1 North Shore & Western",
                "disassembledName": "T1",
                "number": "T1",
                "iconId": 1,
                "destination": {
                    "id": "2000153",
                    "name": "Central Station",
                },
                "operator": {
                    "id": "SydneyTrains",
                    "name": "Sydney Trains",
                },
            },
        },
        {
            "location": {
                "id": "10101124",
                "name": "Hornsby Station",
                "type": "stop",
            },
            "departureTimePlanned": "2026-03-29T19:35:00+10:00",
            "departureTimeEstimated": "2026-03-29T19:42:00+10:00",
            "isRealtimeControlled": True,
            "transportation": {
                "id": "T1-004",
                "name": "T1 North Shore & Western",
                "disassembledName": "T1",
                "number": "T1",
                "iconId": 1,
                "destination": {
                    "id": "2000153",
                    "name": "Central Station",
                },
                "operator": {
                    "id": "SydneyTrains",
                    "name": "Sydney Trains",
                },
            },
        },
        {
            "location": {
                "id": "10101124",
                "name": "Hornsby Station",
                "type": "stop",
            },
            "departureTimePlanned": "2026-03-29T19:45:00+10:00",
            "departureTimeEstimated": None,
            "isRealtimeControlled": True,
            "transportation": {
                "id": "T1-005",
                "name": "T1 North Shore & Western",
                "disassembledName": "T1",
                "number": "T1",
                "iconId": 1,
                "destination": {
                    "id": "2000153",
                    "name": "Central Station",
                },
                "operator": {
                    "id": "SydneyTrains",
                    "name": "Sydney Trains",
                },
            },
        },
    ],
}

# ---------------------------------------------------------------------------
# TfNSW: Trip Planner — Hornsby to Chatswood, 2 journeys
# ---------------------------------------------------------------------------

_ROUTE_ID = "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
_LEG_ID = "f9e8d7c6-b5a4-3210-fedc-ba0987654321"

TFNSW_TRIP_HORNSBY_CHATSWOOD = {
    "version": "10.2.15.18",
    "journeys": [
        # Journey 1: on time, full stop sequence
        {
            "tripId": "journey-001",
            "legs": [
                {
                    "id": _LEG_ID,
                    "duration": 1200,
                    "origin": {
                        "id": "10101124",
                        "name": "Hornsby Station",
                        "type": "stop",
                        "departureTimePlanned": "2026-03-29T19:15:00+10:00",
                        "departureTimeEstimated": None,
                    },
                    "destination": {
                        "id": "10101282",
                        "name": "Chatswood Station",
                        "type": "stop",
                        "arrivalTimePlanned": "2026-03-29T19:35:00+10:00",
                        "arrivalTimeEstimated": None,
                    },
                    "transportation": {
                        "id": _ROUTE_ID,
                        "name": "T1 North Shore & Western Line",
                        "disassembledName": "T1",
                        "number": "T1",
                        "iconId": 1,
                        "destination": {
                            "id": "2000153",
                            "name": "Central Station",
                        },
                        "operator": {
                            "id": "SydneyTrains",
                            "name": "Sydney Trains",
                        },
                    },
                    "stopSequence": [
                        {
                            "id": "10101124",
                            "name": "Hornsby Station",
                            "arrivalTimePlanned": "2026-03-29T19:15:00+10:00",
                            "departureTimePlanned": "2026-03-29T19:15:00+10:00",
                        },
                        {
                            "id": "10101125",
                            "name": "Waitara Station",
                            "arrivalTimePlanned": "2026-03-29T19:17:00+10:00",
                            "departureTimePlanned": "2026-03-29T19:17:00+10:00",
                        },
                        {
                            "id": "10101126",
                            "name": "Wahroonga Station",
                            "arrivalTimePlanned": "2026-03-29T19:19:00+10:00",
                            "departureTimePlanned": "2026-03-29T19:19:00+10:00",
                        },
                        {
                            "id": "10101127",
                            "name": "Turramurra Station",
                            "arrivalTimePlanned": "2026-03-29T19:21:00+10:00",
                            "departureTimePlanned": "2026-03-29T19:21:00+10:00",
                        },
                        {
                            "id": "10101128",
                            "name": "Pymble Station",
                            "arrivalTimePlanned": "2026-03-29T19:23:00+10:00",
                            "departureTimePlanned": "2026-03-29T19:23:00+10:00",
                        },
                        {
                            "id": "10101129",
                            "name": "Gordon Station",
                            "arrivalTimePlanned": "2026-03-29T19:26:00+10:00",
                            "departureTimePlanned": "2026-03-29T19:26:00+10:00",
                        },
                        {
                            "id": "10101130",
                            "name": "Killara Station",
                            "arrivalTimePlanned": "2026-03-29T19:28:00+10:00",
                            "departureTimePlanned": "2026-03-29T19:28:00+10:00",
                        },
                        {
                            "id": "10101131",
                            "name": "Lindfield Station",
                            "arrivalTimePlanned": "2026-03-29T19:30:00+10:00",
                            "departureTimePlanned": "2026-03-29T19:30:00+10:00",
                        },
                        {
                            "id": "10101132",
                            "name": "Roseville Station",
                            "arrivalTimePlanned": "2026-03-29T19:32:00+10:00",
                            "departureTimePlanned": "2026-03-29T19:32:00+10:00",
                        },
                        {
                            "id": "10101282",
                            "name": "Chatswood Station",
                            "arrivalTimePlanned": "2026-03-29T19:35:00+10:00",
                            "departureTimePlanned": "2026-03-29T19:35:00+10:00",
                        },
                    ],
                }
            ],
        },
        # Journey 2: delayed (7 min)
        {
            "tripId": "journey-002",
            "legs": [
                {
                    "id": _LEG_ID,
                    "duration": 1500,
                    "origin": {
                        "id": "10101124",
                        "name": "Hornsby Station",
                        "type": "stop",
                        "departureTimePlanned": "2026-03-29T19:25:00+10:00",
                        "departureTimeEstimated": "2026-03-29T19:32:00+10:00",
                    },
                    "destination": {
                        "id": "10101282",
                        "name": "Chatswood Station",
                        "type": "stop",
                        "arrivalTimePlanned": "2026-03-29T19:45:00+10:00",
                        "arrivalTimeEstimated": "2026-03-29T19:52:00+10:00",
                    },
                    "transportation": {
                        "id": _ROUTE_ID,
                        "name": "T1 North Shore & Western Line",
                        "disassembledName": "T1",
                        "number": "T1",
                        "iconId": 1,
                        "destination": {
                            "id": "2000153",
                            "name": "Central Station",
                        },
                        "operator": {
                            "id": "SydneyTrains",
                            "name": "Sydney Trains",
                        },
                    },
                    "stopSequence": [],
                }
            ],
        },
    ],
}

# ---------------------------------------------------------------------------
# GTFS-RT: Service advisory — signal failure Gordon–Chatswood
# ---------------------------------------------------------------------------

GTFS_ADVISORY_T1 = {
    "header": "T1 North Shore Line: Significant Delays",
    "description": (
        "Signal equipment failure between Gordon and Chatswood. "
        "Trains on the T1 North Shore Line are experiencing SIGNIFICANT_DELAYS. "
        "Allow extra travel time. Bus replacement services are NOT operating."
    ),
    "effect": "SIGNIFICANT_DELAYS",
    "cause": "TECHNICAL_PROBLEM",
    "severity_level": "WARNING",
    "active_period": {
        "start": "2026-03-29T18:30:00+10:00",
        "end": "2026-03-29T22:00:00+10:00",
    },
    "informed_entity": [
        {
            "route_id": _ROUTE_ID,
            "route_short_name": "T1",
            "agency_id": "SydneyTrains",
        },
        {"stop_id": "2000446", "stop_name": "Gordon"},
        {"stop_id": "2000447", "stop_name": "Killara"},
        {"stop_id": "2000448", "stop_name": "Lindfield"},
        {"stop_id": "2000449", "stop_name": "Roseville"},
        {"stop_id": "2000325", "stop_name": "Chatswood"},
    ],
    "url": "https://transportnsw.info/alerts/T1-signal-fault-20260329",
}

# ---------------------------------------------------------------------------
# localStorage seed profile for browser-based testing
# ---------------------------------------------------------------------------

def build_seed_profile(api_key: str) -> dict[str, str]:
    """Return a dict of localStorage key → JSON-encoded string values.

    All values are json.dumps()-encoded so they can be set directly via
    localStorage.setItem(key, value) without an extra serialisation step.
    """
    route = {
        "id": _ROUTE_ID,
        "name": "Hornsby to Chatswood",
        "createdAt": 1743150000000,
        # legs format (used by both v0 and v2 specs)
        "legs": [
            {
                "id": _LEG_ID,
                "originStopId": "2000441",
                "destinationStopId": "2000325",
                "mode": "train",
            }
        ],
    }

    behavior_log = [
        {"routeId": _ROUTE_ID, "checkedAt": 1743051900000, "dayOfWeek": 3},  # Wed 8:05am
        {"routeId": _ROUTE_ID, "checkedAt": 1743137880000, "dayOfWeek": 4},  # Thu 7:58am
        {"routeId": _ROUTE_ID, "checkedAt": 1743224520000, "dayOfWeek": 5},  # Fri 8:12am
    ]

    notif_settings = {
        "delays": True,
        "cancellations": True,
        "service_advisories": True,
        "pre_departure_minutes": 15,
    }

    return {
        "smrt_api_key": json.dumps(api_key),
        "smrt_user_name": json.dumps("Alex Chen"),
        "smrt_user_location": json.dumps({
            "name": "Hornsby",
            "lat": -33.7033,
            "lon": 151.0983,
        }),
        "smrt_routes": json.dumps([route]),
        "smrt_saved_routes": json.dumps([route]),
        "smrt_active_route": json.dumps(_ROUTE_ID),
        "smrt_selected_route": json.dumps(_ROUTE_ID),
        "smrt_behavior": json.dumps(behavior_log),
        "smrt_behaviour": json.dumps(behavior_log),
        "smrt_behavior_log": json.dumps(behavior_log),
        "smrt_notif_settings": json.dumps(notif_settings),
        "smrt_notifications_enabled": json.dumps(True),
    }
