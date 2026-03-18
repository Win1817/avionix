# AVIONIX — System Architecture

---

## 1. High-Level Architecture

AVIONIX is built as a **microservices system** with event-driven communication via Apache Kafka and synchronous REST APIs exposed through a single API Gateway.

```
╔══════════════════════════════════════════════════════════════════╗
║                     EXTERNAL WORLD                               ║
║  ADS-B Receivers  ·  Radar Feeds (ASTERIX)  ·  FIXM Flight Plans ║
╚══════════════════════════════════╦═══════════════════════════════╝
                                   ║ HTTP POST
                    ╔══════════════▼════════════════╗
                    ║     data-ingest-service        ║  :3008
                    ║  ADS-B · ASTERIX · FIXM        ║
                    ║  Normalize → Validate → Persist║
                    ╚══════════════╦════════════════╝
                                   ║ Kafka publish
                    ╔══════════════▼════════════════╗
                    ║          KAFKA                 ║  :9092
                    ║  avionix.surveillance.positions║
                    ║  avionix.flights.filed         ║
                    ║  avionix.flights.activated     ║
                    ║  avionix.weather.reports       ║
                    ╚═╦═══════╦═══════╦══════╦══════╝
                      ║       ║       ║      ║
          ╔═══════════▼╗  ╔══▼══╗ ╔══▼══╗ ╔▼════════╗
          ║surveillance║  ║fdps ║ ║snet ║ ║analytics║
          ║  :3003     ║  ║:3001║ ║:3002║ ║  :3006  ║
          ╚═════╦══════╝  ╚══╦══╝ ╚══╦══╝ ╚═════════╝
                ║            ║       ║
                ╚════════════╩═══════╩══╗
                                        ║ SQL
                         ╔══════════════▼════════════╗
                         ║       PostgreSQL 16         ║  :5432
                         ║  17 tables · PostGIS        ║
                         ║  surveillance_reports       ║
                         ║  flights · trajectories_4d  ║
                         ║  safety_alerts · handoffs   ║
                         ╚═════════════════════════════╝

         coordination :3004 ──────────────────────────┤
         weather       :3005 ─────────────────────────┤
         ml-service    :3007 ─────────────────────────┘

                    ╔══════════════════════════════╗
                    ║       Keycloak               ║  :8080
                    ║  OIDC · JWT (RS256) · RBAC   ║
                    ║  avionix realm · 9 roles      ║
                    ╚══════════════╦═══════════════╝
                                   ║ JWKS validation
                    ╔══════════════▼════════════════╗
                    ║        api-gateway             ║  :4000
                    ║  HTTP reverse proxy            ║
                    ║  WebSocket aggregator /ws      ║
                    ║  Rate limiting · CORS          ║
                    ╚══════════════╦════════════════╝
                                   ║ HTTP + WS
                    ╔══════════════▼════════════════╗
                    ║         frontend               ║  :5173
                    ║  React · Vite · Redux          ║
                    ║  CWP · Analytics · Weather     ║
                    ║  Coordination · ML/AI          ║
                    ╚═══════════════════════════════╝
```

---

## 2. Service Dependency Graph

```
                     Keycloak
                     (auth)
                       │
            ┌──────────┼──────────┬──────────────┐
            │          │          │              │
       api-gateway   fdps       snet        coordination
            │          │          │              │
            └──────────┴──────────┴──────────────┘
                                │
                           PostgreSQL
                                │
                      ┌─────────┴──────────┐
                      │                    │
                  surveillance          analytics
                      │
                   Kafka
                      │
              data-ingest-service
              (external data feeds)
```

---

## 3. Real-Time Data Flow

### 3.1 Position Update Flow (ADS-B → Controller Screen)

```
ADS-B Receiver (dump1090)
    │
    │ POST /ingest/adsb (JSON, ~1s intervals)
    ▼
data-ingest-service
    │ parse → normalize → validate
    │
    ├─► PostgreSQL: INSERT surveillance_reports
    │
    └─► Kafka: publish → avionix.surveillance.positions
                │
                ├─► surveillance-service consumes
                │       │ WebSocket broadcast to api-gateway upstream
                │       └─► api-gateway → all connected frontend clients
                │                └─► Redux: updatePosition()
                │                    └─► RadarScope re-renders aircraft
                │
                ├─► snet-service consumes
                │       │ Run separation checks
                │       └─► If conflict → INSERT safety_alert
                │               └─► WebSocket broadcast STCA
                │                   └─► AlertsPanel shows alert
                │                       └─► Audio beep played
                │
                └─► analytics-service consumes
                        └─► Update real-time sector metrics
```

### 3.2 Conflict Detection Flow

```
snet-service STCA scan (triggered by position update)
    │
    │ Query: all active flights with recent surveillance
    ▼
For each aircraft pair:
    │ calculateDistanceNM(lat1,lon1, lat2,lon2)
    │ verticalDist = |alt1 - alt2|
    ▼
If hDist < 5NM AND vDist < 1000ft:
    │ ConflictPredictor.estimateRisk(hDist, vDist, ttc, speed)
    │ determineSeverity(hDist, vDist, ttc)
    ▼
If severity = CRITICAL or HIGH:
    │ INSERT safety_alerts
    └─► WebSocket broadcast to all controllers
            └─► AlertsPanel: alert added to top of list
                └─► CSS flash animation + audio beep
```

### 3.3 Controller Clearance Flow

```
Controller types clearance in FlightDetail tab
    │ POST /api/coordination/clearances
    ▼
api-gateway → coordination-service
    │ authorize('ATC_CONTROLLER')
    │ authorizeSector check
    ▼
INSERT clearances (flight_id, type, instruction, issued_by, issued_at)
    │
    └─► Response 201 → Frontend shows "✅ Clearance issued"
```

---

## 4. Frontend Architecture

```
App.jsx
├── Keycloak init (SSO check-sso)
├── Redux Provider
└── BrowserRouter
    ├── /login → LoginPage (Keycloak redirect)
    └── / → DashboardLayout (ProtectedRoute)
        ├── Topbar (WS status, active flights count, user info)
        ├── Sidebar (role-filtered nav items)
        └── <Outlet>
            ├── /cwp → CWPPage
            │   ├── FlightStrips (left)
            │   ├── RadarScope (center, canvas 60fps)
            │   │   └── Aircraft targets, velocity vectors,
            │   │       track history, trajectory overlay
            │   └── AlertsPanel + FlightDetail (right)
            │
            ├── /analytics → AnalyticsPage
            │   ├── KPI cards
            │   ├── Safety trends (BarChart)
            │   ├── Traffic flow (LineChart)
            │   ├── Sector load bars
            │   └── Controller workload
            │
            ├── /weather → WeatherPage
            │   ├── SIGMET list
            │   ├── METAR lookup
            │   └── ML hazard display
            │
            ├── /coordination → CoordinationPage
            │   ├── Pending handoffs table
            │   └── Sector status grid
            │
            └── /ml → MLPage
                ├── Airspace risk assessment
                ├── High-risk pair table
                ├── Demand forecast
                └── Active model registry
```

---

## 5. Database Schema Overview

```
flights (id, callsign, status, sector_id, cruise_altitude, ...)
    ├── flight_plans_extended (flight_id, route, waypoints JSONB)
    ├── trajectories_4d (flight_id, trajectory_points JSONB, confidence, is_current)
    ├── clearances (flight_id, type, instruction, issued_by)
    └── handoffs (flight_id, from_sector_id, to_sector_id, status)

surveillance_reports (flight_id, callsign, source, lat, lon, alt, speed, ...)
    └── Append-only. Index: (flight_id, timestamp DESC)

safety_alerts (alert_type, severity, flight_id_primary, flight_id_secondary, ...)
    └── is_active flag. Index: (is_active, detection_time DESC)

sectors (id, type, alt_lower, alt_upper, boundary_polygon JSONB)
users (id UUID, preferred_username, roles TEXT[], sector_assignment)
separation_minima (type, horizontal_nm, vertical_feet)

metars (station_icao, raw_text, wind, visibility, ...)
tafs (station_icao, issued_at, valid_from, valid_to, ...)
sigmets (fir, phenomenon, level_lower, level_upper, area_polygon JSONB, ...)
pireps (callsign, lat, lon, altitude, turbulence_intensity, ...)
```

---

## 6. Kafka Topics and Event Schemas

### avionix.surveillance.positions
```json
{
  "source": "ADS_B",
  "callsign": "PAL101",
  "icao24": "4B1820",
  "lat": 14.5995,
  "lon": 121.0197,
  "altitude": 35000,
  "groundSpeed": 480,
  "track": 270,
  "verticalRate": 0,
  "squawk": "2341",
  "ingestedAt": "2025-01-15T08:00:00.000Z"
}
```

### avionix.flights.filed
```json
{
  "id": "uuid",
  "callsign": "PAL101",
  "status": "FILED",
  "departure_airport": "RPLL",
  "destination_airport": "RJTT",
  "ingestedAt": "2025-01-15T08:00:00.000Z"
}
```

---

## 7. Port and Network Reference

All services communicate on the `avionix-net` Docker bridge network using container names as hostnames.

```
External (host) → Container
:5173  → frontend:80
:4000  → api-gateway:4000
:3008  → data-ingest-service:3008
:8080  → keycloak:8080
:8090  → kafka-ui:8080
:9090  → prometheus:9090
:3000  → grafana:3000

Internal only (no host binding):
:3001  fdps-service
:3002  snet-service
:3003  surveillance-service
:3004  coordination-service
:3005  weather-service
:3006  analytics-service
:3007  ml-service
:5432  postgres
:6379  redis
:9092  kafka
:2181  zookeeper
```
