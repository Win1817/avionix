# AVIONIX — Service Descriptions

> Detailed description of each microservice: purpose, responsibilities, API surface, Kafka topics, and dependencies.

---

## 1. data-ingest-service

**Port:** 3008  
**Role:** System entry point for all external data feeds

### Purpose
Receives raw surveillance and flight plan data from external sources, normalizes it to a unified internal format, persists it to PostgreSQL, and publishes events to Kafka for downstream consumption.

### Responsibilities
- Parse **ADS-B JSON** (dump1090, VRS, OpenSky format)
- Parse **ASTERIX CAT021/CAT048** binary radar data (base64-encoded)
- Parse **FIXM 4.3** flight plan messages (JSON subset)
- Accept **bulk position updates** from aggregators
- Publish all ingested data to appropriate Kafka topics
- Fall back to direct DB write if Kafka is unavailable
- Expose ingestion statistics for monitoring

### Key Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ingest/adsb` | Ingest ADS-B JSON batch |
| `POST` | `/ingest/asterix` | Ingest ASTERIX binary (base64) |
| `POST` | `/ingest/fixm` | Ingest FIXM flight plan |
| `POST` | `/ingest/bulk-positions` | Bulk position update |
| `GET` | `/stats` | Ingestion counters |
| `GET` | `/health` | Service health |

### Kafka Topics Published
| Topic | Trigger |
|-------|---------|
| `avionix.surveillance.positions` | Every position report |
| `avionix.flights.filed` | New FIXM flight plan |

### Dependencies
- PostgreSQL (direct write for `surveillance_reports`, `flights`)
- Kafka (primary publish target)
- Keycloak (JWT validation)

---

## 2. fdps-service (Flight Data Processing Service)

**Port:** 3001  
**Role:** Core flight data management and trajectory computation

### Purpose
Manages the full lifecycle of flight plans from filing through completion. Computes ML-enhanced 4D trajectories and provides conflict detection logic used by safety nets.

### Responsibilities
- Accept and validate flight plan filings (SFPL)
- Maintain flight status state machine (FILED → ACTIVATED → AIRBORNE → ACTIVE → LANDED)
- Compute 4D trajectory predictions using kinematic model with wind correction (ML-enhanced via `MLTrajectoryPredictor`)
- Perform geometric conflict detection between flight pairs
- Assign flights to sectors and controllers
- Expose flight data to all other services via REST

### Flight Status State Machine
```
FILED → ACTIVATED → AIRBORNE → ACTIVE → LANDED
                 ↘                    ↗
              CANCELLED          DIVERTED
```

### Key Endpoints
| Method | Path | Auth Role | Description |
|--------|------|-----------|-------------|
| `POST` | `/api/fdps/flights` | CONTROLLER+ | File new flight plan |
| `GET` | `/api/fdps/flights` | TRAINEE+ | List active flights |
| `GET` | `/api/fdps/flights/:id` | TRAINEE+ | Get flight details |
| `PUT` | `/api/fdps/flights/:id` | CONTROLLER+ | Update flight |
| `POST` | `/api/fdps/trajectories/:id` | CONTROLLER+ | Calculate 4D trajectory |
| `GET` | `/api/fdps/trajectories/:id` | ALL | Get current trajectory |
| `POST` | `/api/fdps/check-conflicts` | CONTROLLER+ | Geometric conflict check |
| `POST` | `/api/fdps/flights/:id/assign-sector` | SUPERVISOR+ | Assign to sector |

### ML Integration
The `MLTrajectoryPredictor` class provides:
- Kinematic base model (physics-based dead reckoning)
- Wind correction vectors (simplified; production uses GRIB2)
- Uncertainty radius growing with prediction horizon (0.5–5.0 NM)
- Confidence score based on data freshness and horizon length

### Dependencies
- PostgreSQL (`flights`, `flight_plans_extended`, `trajectories_4d`, `surveillance_reports`)
- Keycloak

---

## 3. snet-service (Safety Nets Service)

**Port:** 3002  
**Role:** Real-time conflict and safety alert detection with WebSocket broadcast

### Purpose
The safety-critical heart of the system. Continuously evaluates separation between aircraft and generates STCA, MSAW, and APW alerts. Broadcasts alerts to all connected controllers via WebSocket within milliseconds of detection.

### Alert Types
| Alert | Full Name | Trigger |
|-------|-----------|---------|
| `STCA` | Short Term Conflict Alert | Predicted separation violation within STCA horizon |
| `MSAW` | Minimum Safe Altitude Warning | Aircraft below safe altitude for terrain |
| `APW` | Airspace Penetration Warning | Unauthorized airspace entry |
| `CLAM` | Cleared Level Adherence Monitor | Aircraft deviating from cleared level |
| `CONFLICT` | Geometric conflict | Current separation violation detected |

### Severity Levels
| Level | H-Separation | V-Separation | TTC |
|-------|-------------|-------------|-----|
| CRITICAL | < 2 NM | < 500 ft | < 30s |
| HIGH | < 3 NM | < 1000 ft | < 60s |
| MEDIUM | < 5 NM | < 2000 ft | — |
| LOW | approaching minima | — | — |

### Key Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/snet/alerts` | Get active alerts (filterable by severity/type) |
| `POST` | `/api/snet/generate-alert` | Manually create alert |
| `PUT` | `/api/snet/alerts/:id/dismiss` | Acknowledge/dismiss alert |
| `POST` | `/api/snet/detect-conflicts` | Run full airspace conflict scan |
| `POST` | `/api/snet/check-msaw` | Run MSAW check on all active flights |
| `POST` | `/api/snet/check-separation` | Check separation between two flights |

### WebSocket
Connects on `ws://snet-service:3002`. Emits:
- `ALERT` — new safety alert
- `STCA` — Short Term Conflict Alert specifically
- `ALERT_DISMISSED` — alert acknowledged by controller

### ML Integration
The `ConflictPredictor` provides a logistic regression risk score for each flight pair evaluated:
- Features: normalized H-distance, V-distance, TTC, relative speed, closure rate
- Output: conflict probability [0–1], risk classification

### Dependencies
- PostgreSQL (`safety_alerts`, `flights`, `surveillance_reports`)
- Keycloak

---

## 4. surveillance-service

**Port:** 3003  
**Role:** Radar picture management and real-time position broadcasting

### Purpose
Maintains the authoritative "current picture" of all aircraft in the airspace. Accepts position reports from all surveillance sources and broadcasts updates to all connected clients via WebSocket.

### Supported Source Types
| Code | Source |
|------|--------|
| `ADS_B` | Automatic Dependent Surveillance-Broadcast |
| `SSR_MODE_C` | Secondary Surveillance Radar Mode C (altitude) |
| `SSR_MODE_S` | SSR Mode S (selective addressing) |
| `MLAT` | Multilateration |
| `ADS_C` | ADS Contract (oceanic) |
| `MANUAL` | Manually entered |

### Key Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/surveillance/positions` | Ingest position batch |
| `GET` | `/api/surveillance/picture` | Current radar picture (all tracks < 2 min old) |
| `GET` | `/api/surveillance/flights/:callsign/track` | Historical track for flight |
| `GET` | `/api/surveillance/squawks/emergency` | Aircraft squawking 7500/7600/7700 |

### Emergency Squawk Codes
| Code | Meaning |
|------|---------|
| 7500 | Hijack |
| 7600 | Communications failure |
| 7700 | General emergency |

### WebSocket
Connects on `ws://surveillance-service:3003`. Emits:
- `POSITION_UPDATE` — new position report with full track data
- `CONNECTED` — connection confirmation

### Dependencies
- PostgreSQL (`surveillance_reports`, `flights`)
- Keycloak

---

## 5. coordination-service

**Port:** 3004  
**Role:** Sector handoffs, clearance issuance, and inter-sector coordination

### Purpose
Manages the transfer of flight responsibility between ATC sectors. Issues and tracks ATC clearances. Provides sector status information to all controllers.

### Handoff State Machine
```
PENDING → ACCEPTED → TRANSFERRED
        ↘          ↘
       REJECTED    CANCELLED
```

### Key Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/coordination/handoffs` | Initiate sector handoff |
| `PUT` | `/api/coordination/handoffs/:id/accept` | Accept incoming handoff |
| `PUT` | `/api/coordination/handoffs/:id/transfer` | Complete transfer (updates flight sector) |
| `GET` | `/api/coordination/handoffs` | List handoffs (filterable by sector/status) |
| `POST` | `/api/coordination/clearances` | Issue ATC clearance |
| `GET` | `/api/coordination/clearances/:flightId` | Get clearance history for flight |
| `GET` | `/api/coordination/sectors` | All sectors with controller assignments |

### Clearance Types
`ROUTE` · `ALTITUDE` · `SPEED` · `APPROACH` · `DEPARTURE` · `TAXI` · `PUSHBACK`

### Dependencies
- PostgreSQL (`handoffs`, `clearances`, `sectors`, `flights`, `users`)
- Keycloak

---

## 6. weather-service

**Port:** 3005  
**Role:** Weather data management and ML-powered hazard prediction

### Purpose
Ingests, stores, and serves aviation weather products. The ML weather hazard model fuses SIGMET coverage with nearby PIREP reports to produce a real-time hazard assessment for any point in the airspace.

### Key Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/weather/metar/:icao` | Latest METAR for station |
| `POST` | `/api/weather/metar` | Ingest new METAR |
| `GET` | `/api/weather/taf/:icao` | Current valid TAF |
| `GET` | `/api/weather/sigmets` | Active SIGMETs (filterable by FIR) |
| `POST` | `/api/weather/sigmets` | Issue new SIGMET |
| `POST` | `/api/weather/pireps` | Submit PIREP |
| `GET` | `/api/weather/hazards/predict` | ML hazard prediction for position |

### SIGMET Phenomena Codes
`TURB` · `ICE` · `TS` · `VA` · `RDOACT` · `TC` · `MTW` · `SEV_ICE`

### ML Hazard Model
Input: lat, lon, altitude, lookahead minutes, recent PIREPs, active SIGMETs  
Output: list of hazards with type, severity, confidence, and overall risk level

### Dependencies
- PostgreSQL (`metars`, `tafs`, `sigmets`, `pireps`)
- Keycloak

---

## 7. analytics-service

**Port:** 3006  
**Role:** Real-time KPIs, safety trends, workload analysis, traffic flow

### Purpose
Aggregates data across all services to provide operational and management dashboards. All queries are read-only. The workload analyzer uses an ML composite scoring model to assess controller load and recommend intervention.

### Key Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/analytics/kpis` | Live KPI summary (flights, alerts, separation) |
| `GET` | `/api/analytics/sectors/metrics` | Per-sector metrics with ML workload score |
| `GET` | `/api/analytics/delays` | Flight delay analysis |
| `GET` | `/api/analytics/safety/trends` | Alert trends over N days |
| `GET` | `/api/analytics/workload/controllers` | Per-controller workload with recommendations |
| `GET` | `/api/analytics/traffic/flow` | Traffic flow by time bucket and airport |

### Workload Score
```
score = (activeFlights/15 × 0.50) + (activeAlerts/5 × 0.35) + (pendingHandoffs/8 × 0.15)
score × 100 → [0–100]
```
Thresholds: HIGH > 12 flights or > 3 alerts, MEDIUM > 7 flights or > 1 alert

### Dependencies
- PostgreSQL (read-only across all tables)
- Keycloak

---

## 8. ml-service

**Port:** 3007  
**Role:** Centralized ML inference API

### Purpose
Exposes a unified machine learning API. All ML predictions can be invoked from any service or directly from the frontend (via gateway). Designed to be the future home of trained ONNX/TensorFlow models.

### Key Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/ml/predict/conflict` | Conflict probability for two aircraft |
| `POST` | `/api/ml/detect/anomaly` | Anomaly detection on position history |
| `GET` | `/api/ml/forecast/demand` | Traffic demand forecast for airport |
| `GET` | `/api/ml/assess/airspace` | Full airspace risk assessment |
| `POST` | `/api/ml/predict/runway-incursion` | Runway incursion risk |

### Active Models
| Model | Version | Type |
|-------|---------|------|
| conflict_predictor | 2.1 | Logistic Regression |
| trajectory_lstm | 2.0 | Kinematic + Wind |
| anomaly_detector | 1.3 | Rule-based Isolation |
| demand_forecaster | 1.5 | Historical Average + XGBoost (planned) |
| weather_hazard | 1.2 | Gradient Boosting |
| runway_safety | 1.0 | Feature-weighted |

### Dependencies
- PostgreSQL (read-only for historical data)
- Keycloak

---

## 9. api-gateway

**Port:** 4000  
**Role:** Single HTTPS/WS entry point for all clients

### Purpose
Proxies all client requests to the appropriate backend service. Aggregates multiple WebSocket feeds into a single `/ws` endpoint. Validates JWTs before routing to prevent unauthenticated requests reaching services.

### Routing Table
| Path Prefix | Target Service |
|-------------|---------------|
| `/api/fdps/*` | fdps-service:3001 |
| `/api/snet/*` | snet-service:3002 |
| `/api/surveillance/*` | surveillance-service:3003 |
| `/api/coordination/*` | coordination-service:3004 |
| `/api/weather/*` | weather-service:3005 |
| `/api/analytics/*` | analytics-service:3006 |
| `/api/ml/*` | ml-service:3007 |
| `/ws` | WebSocket aggregator |

### WebSocket Aggregation
The gateway maintains persistent upstream WebSocket connections to `snet-service` and `surveillance-service`. All messages received from either upstream are broadcast to all connected frontend clients on `/ws`.

### Key Endpoints
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Gateway health |
| `GET` | `/health/all` | Aggregate health of all services |
| `WS` | `/ws?token=<jwt>` | Aggregated real-time event stream |

### Dependencies
- Keycloak (JWKS endpoint for JWT validation)
- All downstream services

---

## 10. keycloak

**Port:** 8080  
**Role:** Identity and Access Management

### Purpose
Provides SSO, JWT issuance, and RBAC policy enforcement for the entire platform. The `avionix` realm is pre-configured with 9 roles, 2 clients, resource-based authorization policies, and user groups for FIR-level access control.

### Realm: `avionix`

**Roles:**
| Role | Level | Description |
|------|-------|-------------|
| SUPER_ADMIN | 10 | Full system access |
| ATC_SUPERVISOR | 8 | Sector oversight, approve overrides |
| OPERATIONS_MANAGER | 5 | Read-all, no flight modification |
| SAFETY_OFFICER | 5 | All alerts and safety reports |
| ATC_CONTROLLER | 6 | Read/write on assigned sector |
| ATC_TRAINEE | 4 | Read-only with limited actions |
| DATA_ANALYST | 3 | Analytics read-only |
| PILOT | 3 | Own flight data and clearances |
| SYSTEM_MONITOR | 2 | Infrastructure monitoring |

**Clients:**
- `avionix-frontend` — public OIDC client for browser SPA
- `avionix-services` — confidential client for service-to-service with ABAC policies

### Dependencies
- PostgreSQL (dedicated `postgres-keycloak` instance)
