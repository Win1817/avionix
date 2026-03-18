# AVIONIX — Simulator Service

> An independent service that generates realistic ATC data and feeds it to all platform services.  
> Used for development, testing, training, and scenario demonstration.

**Port:** 3009  
**Profile:** `simulator` (opt-in via Docker Compose profile)

---

## Overview

The simulator generates:
- **Flight plans** — realistic Philippine FIR routes (domestic + international)
- **ADS-B positions** — physics-based aircraft movement with climb/cruise/descent phases
- **METAR weather** — all Philippine airports, updated every 3 minutes
- **SIGMETs** — significant weather events over the FIR
- **PIREPs** — pilot weather reports from simulated aircraft
- **Alert scenarios** — STCA conflicts, emergency squawks, missed approaches

It is **fully independent** — no Kafka or database required. It pushes data to the platform via HTTP.

```
simulator-service
    │
    ├─► POST /ingest/adsb     → data-ingest-service → Kafka → all services
    ├─► POST /api/fdps/flights → fdps-service
    ├─► POST /api/weather/metar → weather-service
    ├─► POST /api/weather/sigmets → weather-service
    └─► POST /api/weather/pireps → weather-service
```

---

## Quick Start

### Start with simulator

```bash
# Start full stack + simulator
docker compose --profile simulator up -d

# Or start simulator separately after the main stack is running
docker compose --profile simulator up simulator-service -d
```

### Auto-start on boot

```bash
# In .env
SIM_AUTO_START=true
SIM_FLIGHT_COUNT=20
SIM_POSITION_INTERVAL_MS=4000
```

---

## REST API

### Start simulator
```http
POST http://localhost:3009/sim/start
Content-Type: application/json

{ "scenario": "freeplay", "flightCount": 20, "positionInterval": 4000 }
```

### Stop simulator
```http
POST http://localhost:3009/sim/stop
```

### Check status
```http
GET http://localhost:3009/sim/status
```

**Response:**
```json
{
  "running": true,
  "stats": {
    "positionsSent": 1840,
    "flightsFiled": 24,
    "weatherReports": 12,
    "alertsTriggered": 3,
    "scenario": "freeplay",
    "startedAt": "2025-01-15T08:00:00Z"
  },
  "activeFlights": [
    { "callsign": "PAL543", "lat": 14.82, "lon": 121.45, "altitude": 35000, "speed": 478, "status": "ACTIVE" }
  ]
}
```

### Switch scenario
```http
POST http://localhost:3009/sim/scenario
Content-Type: application/json

{ "name": "conflict" }
```

### Inject specific event
```http
POST http://localhost:3009/sim/inject
Content-Type: application/json

{ "type": "emergency_squawk", "data": { "callsign": "PAL543" } }
```

---

## Scenarios

| Scenario | Description |
|----------|-------------|
| `freeplay` | Normal mixed traffic — domestic and international flights, random minor events |
| `conflict` | Forces two aircraft onto a converging course — triggers STCA alerts |
| `emergency` | Injects 7700 emergency squawk on a random flight |
| `weather_event` | Issues a severe SIGMET (TS or TC) over active airspace |
| `rush_hour` | Double the normal flight count — workload stress test |
| `night_ops` | Reduced traffic, lower altitudes, cargo mix |

---

## Injectable Events

| Type | Effect | Data |
|------|--------|------|
| `conflict` | Forces two flights within separation minima | `{ callsign1, callsign2 }` |
| `emergency_squawk` | Sets 7700/7600/7500 squawk | `{ callsign }` |
| `sigmet` | Issues a SIGMET over the FIR | `{ phenomenon, fir, ... }` |
| `missed_approach` | Aircraft in approach reverses to climb | `{ callsign }` |

---

## Data Generation Details

### Flight Physics
- Aircraft advance using dead reckoning + heading correction toward destination
- Phases: `CLIMB` → `CRUISE` → `DESCENT` → `APPROACH` → `LANDED`
- Climb rate: 1,200–2,100 ft/min (type-specific)
- Cruise altitude: 18,000–35,000 ft (route-specific)
- Wind drift applied each tick

### Philippine FIR Routes
13 airlines × 12 typical routes, covering:
- RPLL (Manila) domestic hub routes
- International routes to RJTT, RKSI, VHHH, WSSS, RJBB
- Domestic island routes (Cebu, Davao, Zamboanga, Palawan)

### Weather Realism
- METAR: wind 3–25kt, temperature 24–34°C, various visibility and ceiling
- SIGMET phenomena: TS, TURB, ICE, TC, VA, MTW
- PIREPs: generated from actual simulated aircraft positions

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `FLIGHT_COUNT` | 20 | Number of simultaneous active flights |
| `POSITION_INTERVAL_MS` | 4000 | Position update interval (ms) |
| `AUTO_START` | false | Start `freeplay` automatically on boot |
| `INGEST_URL` | `http://data-ingest-service:3008` | Data ingest endpoint |
| `GATEWAY_URL` | `http://api-gateway:4000` | API gateway for FDPS/weather |
| `SIM_TOKEN` | _(empty)_ | Service account JWT (required in prod) |
