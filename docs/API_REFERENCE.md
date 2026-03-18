# AVIONIX — API Reference

> All requests require `Authorization: Bearer <keycloak_jwt>` unless marked public.  
> Base URL: `http://localhost:4000` (via API Gateway)

---

## Authentication

### Get Token (Keycloak)
```http
POST http://localhost:8080/realms/avionix/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=password&client_id=avionix-frontend&username=controller1&password=pass
```

**Response:**
```json
{ "access_token": "eyJ...", "token_type": "Bearer", "expires_in": 300 }
```

---

## FDPS — Flight Data Processing

### File Flight Plan
```http
POST /api/fdps/flights
Roles: ATC_CONTROLLER, ATC_SUPERVISOR, SUPER_ADMIN
```
**Request:**
```json
{
  "callsign": "PAL101",
  "aircraft_type": "B77W",
  "aircraft_registration": "RP-C7772",
  "departure_airport": "RPLL",
  "destination_airport": "RJTT",
  "departure_time": "2025-01-15T08:00:00Z",
  "cruise_altitude": 35000,
  "cruise_speed": 480,
  "flight_rules": "I",
  "operator_icao": "PAL",
  "route": "ENARI DCT APARI DCT IGARI",
  "waypoints": [{"id":"ENARI","lat":14.8,"lon":121.5},{"id":"APARI","lat":18.6,"lon":122.1}]
}
```
**Response:**
```json
{ "success": true, "message": "Flight plan filed", "data": { "id": "uuid", "callsign": "PAL101", "status": "FILED", ... } }
```

### List Active Flights
```http
GET /api/fdps/flights?status=ACTIVE&sector=RPHI_S1&limit=100&offset=0
Roles: ATC_TRAINEE+
```

### Get Flight
```http
GET /api/fdps/flights/:flightId
```

### Update Flight
```http
PUT /api/fdps/flights/:flightId
Roles: ATC_CONTROLLER+

{ "cruise_altitude": 37000, "status": "ACTIVE" }
```

### Calculate 4D Trajectory
```http
POST /api/fdps/trajectories/:flightId
Roles: ATC_CONTROLLER+

{ "prediction_horizon": 20, "use_ml": true }
```
**Response data:**
```json
{
  "flight_id": "uuid",
  "trajectory_points": [
    { "time": "2025-01-15T08:05:00Z", "lat": 14.52, "lon": 121.05, "altitude": 35000, "speed": 480, "uncertainty_radius_nm": 0.5 }
  ],
  "confidence_level": 0.92,
  "ml_model_used": "lstm_v2"
}
```

### Check Conflicts
```http
POST /api/fdps/check-conflicts
Roles: ATC_CONTROLLER+

{ "flightId1": "uuid1", "flightId2": "uuid2" }
```

### Assign Sector
```http
POST /api/fdps/flights/:flightId/assign-sector
Roles: ATC_SUPERVISOR+

{ "sector_id": "RPHI_S1", "controller_id": "user-uuid" }
```

---

## SNET — Safety Nets

### Get Active Alerts
```http
GET /api/snet/alerts?severity=CRITICAL&type=STCA&limit=50
Roles: ATC_TRAINEE+
```

### Generate Alert
```http
POST /api/snet/generate-alert
Roles: ATC_CONTROLLER+

{
  "alertType": "STCA",
  "severity": "HIGH",
  "flightIdPrimary": "uuid1",
  "flightIdSecondary": "uuid2",
  "horizontalDistance": 3.2,
  "verticalDistance": 800,
  "timeToCollision": 45,
  "description": "STCA: PAL101 vs CEB202"
}
```

### Dismiss Alert
```http
PUT /api/snet/alerts/:alertId/dismiss
Roles: ATC_CONTROLLER+

{ "resolutionAction": "CONTROLLER_APPROVED" }
```

### Detect All Conflicts
```http
POST /api/snet/detect-conflicts
Roles: ATC_CONTROLLER+
```
**Response data:**
```json
{
  "totalFlights": 42,
  "conflictsDetected": 2,
  "conflicts": [
    {
      "flight1": "PAL101", "flight2": "CEB202",
      "horizontalDistance": 3.1, "verticalDistance": 700,
      "timeToCollision": 52, "severity": "HIGH",
      "mlRiskScore": 0.78
    }
  ]
}
```

### Check MSAW
```http
POST /api/snet/check-msaw
Roles: ATC_CONTROLLER+
```

### Check Separation
```http
POST /api/snet/check-separation

{ "flightId1": "uuid1", "flightId2": "uuid2" }
```

---

## Surveillance

### Ingest Positions (ADS-B)
```http
POST /api/surveillance/positions
Roles: SUPER_ADMIN, ATC_SUPERVISOR

{
  "source": "ADS_B",
  "reports": [
    {
      "callsign": "PAL101",
      "icao24": "4B1820",
      "lat": 14.5995,
      "lon": 121.0,
      "altitude": 35000,
      "ground_speed": 480,
      "track": 270,
      "vertical_rate": 0,
      "squawk": "2341",
      "signal_quality": 0.95
    }
  ]
}
```

### Get Radar Picture
```http
GET /api/surveillance/picture?sector=RPHI_S1&min_alt=0&max_alt=60000
Roles: ATC_TRAINEE+
```

### Get Flight Track
```http
GET /api/surveillance/flights/PAL101/track?minutes=60
Roles: ATC_TRAINEE+
```

### Get Emergency Squawks
```http
GET /api/surveillance/squawks/emergency
Roles: ATC_CONTROLLER+
```

---

## Coordination

### Initiate Handoff
```http
POST /api/coordination/handoffs
Roles: ATC_CONTROLLER+

{
  "flight_id": "uuid",
  "from_sector": "RPHI_S1",
  "to_sector": "RPHI_S2",
  "transfer_altitude": 35000,
  "transfer_condition": "At ENARI",
  "estimated_boundary_time": "2025-01-15T08:30:00Z"
}
```

### Accept Handoff
```http
PUT /api/coordination/handoffs/:handoffId/accept
Roles: ATC_CONTROLLER+
```

### Transfer Flight
```http
PUT /api/coordination/handoffs/:handoffId/transfer
Roles: ATC_CONTROLLER+
```
*Atomically updates handoff status and flight sector_id.*

### Issue Clearance
```http
POST /api/coordination/clearances
Roles: ATC_CONTROLLER+

{
  "flight_id": "uuid",
  "type": "ALTITUDE",
  "instruction": "PAL101 climb and maintain FL370",
  "cleared_altitude": 37000
}
```

### Get Sectors
```http
GET /api/coordination/sectors
Roles: ATC_TRAINEE+
```

---

## Weather

### Get METAR
```http
GET /api/weather/metar/RPLL
Roles: ATC_TRAINEE+
```

### Get TAF
```http
GET /api/weather/taf/RPLL
```

### Get SIGMETs
```http
GET /api/weather/sigmets?fir=RPHI
```

### Issue SIGMET
```http
POST /api/weather/sigmets
Roles: ATC_SUPERVISOR+

{
  "fir": "RPHI",
  "phenomenon": "TS",
  "level_lower": 10000,
  "level_upper": 45000,
  "area_polygon": [[14.0,120.0],[16.0,120.0],[16.0,122.0],[14.0,122.0]],
  "intensity": "INTSF",
  "valid_from": "2025-01-15T08:00:00Z",
  "valid_to": "2025-01-15T14:00:00Z",
  "raw_text": "RPHI SIGMET 3 VALID 150800/151400 RPLL - RPHI MANILA FIR TS OBS N OF N1600 MOV NE INTSF"
}
```

### Submit PIREP
```http
POST /api/weather/pireps
Roles: ATC_CONTROLLER+, PILOT

{
  "callsign": "PAL101",
  "lat": 15.5, "lon": 122.0,
  "altitude": 35000,
  "turbulence_intensity": "MODERATE",
  "icing_intensity": "LIGHT",
  "wind_dir": 270, "wind_speed": 55
}
```

### ML Hazard Prediction
```http
GET /api/weather/hazards/predict?lat=15.5&lon=122.0&altitude=35000&lookahead_minutes=30
```

---

## Analytics

### KPI Dashboard
```http
GET /api/analytics/kpis
Roles: OPERATIONS_MANAGER+
```
**Response data:**
```json
{
  "flights": { "active": 42, "today": 187, "cancelled_today": 3 },
  "alerts": { "active": 2, "critical_today": 1, "total_today": 15 },
  "separation": { "avg_horizontal_nm": 12.4, "min_horizontal_nm": 4.1, "violations_today": 0 }
}
```

### Sector Metrics
```http
GET /api/analytics/sectors/metrics
```

### Safety Trends
```http
GET /api/analytics/safety/trends?days=30
```

### Controller Workload
```http
GET /api/analytics/workload/controllers
Roles: ATC_SUPERVISOR+
```

### Delay Analysis
```http
GET /api/analytics/delays?airport=RPLL&hours=24
```

### Traffic Flow
```http
GET /api/analytics/traffic/flow?hours=6&granularity=15+minutes
```

---

## ML Service

### Conflict Prediction
```http
POST /api/ml/predict/conflict
Roles: ATC_CONTROLLER+

{
  "flight1": { "callsign": "PAL101", "lat": 14.5, "lon": 121.0, "altitude": 35000, "speed": 480, "heading": 270 },
  "flight2": { "callsign": "CEB202", "lat": 14.6, "lon": 121.5, "altitude": 35000, "speed": 460, "heading": 090 }
}
```

### Anomaly Detection
```http
POST /api/ml/detect/anomaly
Roles: ATC_CONTROLLER+

{
  "callsign": "PAL101",
  "positions": [
    { "lat": 14.5, "lon": 121.0, "altitude": 35000, "speed": 480, "heading": 270, "timestamp": "2025-01-15T08:00:00Z" },
    { "lat": 14.6, "lon": 120.8, "altitude": 35000, "speed": 483, "heading": 268, "timestamp": "2025-01-15T08:01:00Z" }
  ]
}
```

### Demand Forecast
```http
GET /api/ml/forecast/demand?airport=RPLL&hours_ahead=6
```

### Airspace Risk Assessment
```http
GET /api/ml/assess/airspace
Roles: ATC_SUPERVISOR+
```

### Runway Incursion Risk
```http
POST /api/ml/predict/runway-incursion
Roles: ATC_CONTROLLER+

{
  "runway_id": "RPLL_24L",
  "aircraft_on_runway": ["PAL101"],
  "aircraft_approaching": ["CEB202"],
  "surface_conditions": "WET"
}
```

---

## API Gateway

### Gateway Health
```http
GET /health
Public
```

### All Services Health
```http
GET /health/all
Roles: SYSTEM_MONITOR+
```

### WebSocket
```
ws://localhost:4000/ws?token=<jwt>
```
**Messages received:**
```json
{ "type": "POSITION_UPDATE", "data": { "callsign": "PAL101", "lat": 14.5, ... } }
{ "type": "ALERT", "data": { "alert_type": "STCA", "severity": "CRITICAL", ... } }
{ "type": "FLIGHT_UPDATE", "data": { "id": "uuid", "status": "ACTIVE", ... } }
{ "type": "HANDOFF", "data": { "callsign": "PAL101", "to_sector": "RPHI_S2" } }
```

---

## Data Ingest

### Ingest ADS-B
```http
POST /ingest/adsb
Roles: SUPER_ADMIN

{
  "aircraft": [
    { "flight": "PAL101", "hex": "4b1820", "lat": 14.5, "lon": 121.0,
      "altitude": 35000, "speed": 480, "track": 270, "squawk": "2341", "rssi": -12.5 }
  ]
}
```

### Ingest Stats
```http
GET /stats
Roles: SUPER_ADMIN, SYSTEM_MONITOR
```
