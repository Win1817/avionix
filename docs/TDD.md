# AVIONIX — Technical Design Document (TDD)

**Version:** 2.0.0  
**Last Updated:** 2025  
**Status:** Active Development  
**Authors:** AVIONIX Engineering Team

---

## 1. Purpose and Scope

This document describes the technical design of the AVIONIX Air Traffic Control Management System. It covers architectural decisions, design patterns, data models, integration contracts, and non-functional requirements.

**In scope:**
- All 10 microservices (including gateway and ingest)
- Kafka event streaming backbone
- Keycloak authentication and RBAC
- PostgreSQL database schema
- Frontend Controller Working Position (CWP)
- Machine learning subsystem

**Out of scope:**
- Hardware radar integration (ASTERIX binary parsing is stubbed)
- VoIP controller communication
- OLDI/AIDC inter-FIR messaging protocol

---

## 2. Architectural Decisions

### 2.1 Microservices over Monolith

**Decision:** Each ATC functional domain (surveillance, flight data, safety nets, weather, coordination) is its own independent service.

**Rationale:**
- ATC systems have strict availability requirements per domain. A surveillance failure must not bring down flight data processing.
- Independent deployability allows rolling upgrades during off-peak periods.
- Different scaling profiles — surveillance handles high-frequency writes, analytics handles complex reads.

**Trade-offs accepted:**
- Increased operational complexity (mitigated by Docker Compose + Kubernetes manifests).
- Network latency between services (mitigated by Kafka async messaging).

---

### 2.2 Kafka as Event Backbone

**Decision:** All position reports and flight plan events are published to Kafka topics before being consumed by downstream services.

**Rationale:**
- ADS-B feeds can burst to 1,000+ position reports per second for busy FIRs. Kafka handles this without backpressure on downstream consumers.
- Enables event replay for incident investigation — a regulatory requirement in many ANSP environments.
- Decouples data producers (data-ingest-service) from consumers (surveillance, FDPS, analytics).

**Topic design:**

| Topic | Key | Consumers |
|-------|-----|-----------|
| `avionix.surveillance.positions` | callsign | surveillance-service, snet-service, analytics-service |
| `avionix.flights.filed` | callsign | fdps-service, coordination-service |
| `avionix.flights.activated` | callsign | surveillance-service, snet-service |
| `avionix.weather.reports` | station_icao | weather-service |
| `avionix.system.events` | service_name | analytics-service, monitoring |

**Retention:** 24 hours (configurable). Increase for incident replay capability.

---

### 2.3 Keycloak for RBAC

**Decision:** All authentication and authorization is delegated to Keycloak rather than a custom auth service.

**Rationale:**
- Keycloak provides battle-tested OpenID Connect / OAuth 2.0 with realm-level RBAC.
- Fine-grained authorization policies (sector ownership, resource-based access) are expressible natively.
- Eliminates the risk of hand-rolled JWT validation vulnerabilities.
- The `avionix` realm is exported as `keycloak/realm-export.json` — fully reproducible.

**Token flow:**
```
User → Frontend → Keycloak (login) → JWT (RS256, 5min TTL)
Frontend → API Gateway → keycloak-auth middleware (JWKS verify) → Service
```

**Sector enforcement:**
Controllers are assigned a sector via Keycloak token claim `sector`. The `authorizeSector` middleware rejects modifications to flights in other sectors (supervisors bypass this).

---

### 2.4 Single API Gateway

**Decision:** All frontend requests go through a single `api-gateway` rather than directly to individual services.

**Rationale:**
- Centralizes CORS, JWT validation, and rate limiting.
- Aggregates multiple backend WebSocket feeds into a single `/ws` endpoint for the frontend.
- Simplifies frontend configuration — one base URL.
- Provides a single point for future API versioning (`/api/v2/...`).

---

### 2.5 Canvas Radar Scope

**Decision:** The radar scope is rendered on an HTML5 `<canvas>` element with a `requestAnimationFrame` loop rather than SVG or a mapping library.

**Rationale:**
- SVG cannot efficiently render 100+ moving aircraft labels at 60 fps.
- Mapping libraries (Leaflet, Mapbox) add abstraction overhead and are designed for geographic maps, not radar scopes.
- Canvas allows custom rendering: radar sweep animation, velocity vectors, altitude labels, STCA rings — all at native speed.
- Aircraft detection on click is implemented via nearest-neighbour search over the flight positions array.

---

## 3. Data Model

### 3.1 Core Tables

```
flights (id, callsign, status, sector_id, cruise_altitude, ...)
  └── flight_plans_extended (flight_id, route, waypoints, ...)
  └── trajectories_4d (flight_id, trajectory_points JSONB, confidence, ...)
  └── clearances (flight_id, type, instruction, issued_by, ...)
  └── handoffs (flight_id, from_sector_id, to_sector_id, status, ...)

surveillance_reports (flight_id, callsign, source, lat, lon, altitude, speed, ...)
  └── Indexed on (flight_id, timestamp DESC) and (callsign, timestamp DESC)

safety_alerts (alert_type, severity, flight_id_primary, flight_id_secondary, ...)
  └── Indexed on (is_active, detection_time DESC)

sectors (id, type, alt_lower, alt_upper, boundary_polygon JSONB, assigned_controller_id)
users (id UUID, preferred_username, roles TEXT[], sector_assignment)

metars, tafs, sigmets, pireps  — weather tables
```

### 3.2 Key Design Choices

- **UUIDs** for all primary keys — avoids sequential ID leakage and supports distributed inserts.
- **JSONB** for `trajectory_points`, `waypoints`, `alert_metadata` — structured but flexible, with GIN index support.
- **PostGIS** extension loaded — `boundary_polygon` and position data are ready for spatial queries (`ST_Within`, `ST_Distance`).
- **`surveillance_reports` is append-only** — never updated. Historical track data is retained for replay and incident analysis.
- **`trajectories_4d.is_current`** flag — only one trajectory per flight is current; older ones kept for comparison.

---

## 4. ML Subsystem Design

### 4.1 Models

| Model | Algorithm | Input Features | Output |
|-------|-----------|----------------|--------|
| Conflict Predictor | Logistic Regression | H-separation, V-separation, TTC, relative speed | Conflict probability [0–1] |
| Trajectory Predictor | Kinematic + wind correction | Current position, speed, heading, wind data | 4D trajectory points + uncertainty radius |
| Anomaly Detector | Rule-based isolation | Implied speed, altitude change rate, heading change | Anomaly flags + score |
| Demand Forecaster | Historical average + noise | DOW, hour, airport, historical counts | Hourly flight count + bounds |
| Weather Hazard | Feature-weighted scoring | SIGMET coverage, PIREP intensity, altitude | Hazard list + overall risk |
| Workload Analyzer | Composite scoring | Active flights, active alerts, pending handoffs | Workload score [0–100] + recommendation |
| Runway Incursion | Feature-weighted | Runway occupancy, approaching aircraft, surface | Risk score + recommendation |

### 4.2 Model Update Strategy

Current models use deterministic algorithms calibrated against ATC incident datasets. The architecture supports swapping to trained ML models (TensorFlow.js, ONNX Runtime) without API changes — the predictor classes expose a consistent `.predict()` interface.

**Planned upgrade path:**
1. Collect labeled separation incident data from production DB.
2. Train logistic regression / LSTM offline in Python.
3. Export to ONNX.
4. Load in ml-service via `onnxruntime-node`.
5. A/B test new model alongside existing one using feature flag.

---

## 5. API Design Principles

All services follow a consistent response envelope:

```json
// Success
{ "success": true, "message": "OK", "data": { ... }, "timestamp": "2025-01-01T00:00:00.000Z" }

// Error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": null }, "timestamp": "..." }
```

**Error codes:**

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing or invalid JWT |
| `FORBIDDEN` | 403 | Valid JWT but insufficient role |
| `NOT_FOUND` | 404 | Resource does not exist |
| `VALIDATION_ERROR` | 400 | Request body fails validation |
| `DUPLICATE` | 409 | Resource already exists |
| `RATE_LIMITED` | 429 | Too many requests |
| `GATEWAY_ERROR` | 502 | Upstream service unavailable |
| `SERVER_ERROR` | 500 | Unhandled internal error |

---

## 6. Security Design

### 6.1 Authentication Flow

```
1. User navigates to frontend
2. Keycloak JS adapter checks for existing SSO session
3. If none → redirect to Keycloak login page
4. On login → Keycloak returns signed JWT (RS256, 5-minute TTL)
5. Frontend stores token in memory (NOT localStorage — XSS mitigation)
6. Requests to API gateway include Bearer token in Authorization header
7. Gateway validates JWT signature against Keycloak JWKS endpoint
8. Validated token claims (roles, sector) are attached to req.user
9. Service-level authorize() middleware checks required roles
10. Token refresh every 4 minutes via Keycloak silent refresh
```

### 6.2 Secrets Management

- All credentials in `.env` (excluded from git via `.gitignore`)
- Keycloak client secret rotatable without code changes
- Database credentials injected via environment at runtime
- No secrets in Docker images or source code

### 6.3 Rate Limiting

- API Gateway: 500 req/min per user
- Individual services: 200 req/min per user
- Data Ingest: 100 bulk requests/min (source IP + token)

---

## 7. Non-Functional Requirements

| Requirement | Target | Mechanism |
|-------------|--------|-----------|
| Position update latency | < 2 seconds end-to-end | Kafka + WebSocket push |
| STCA alert latency | < 500ms from position report | Kafka consumer + WebSocket |
| API response time (p95) | < 200ms | Connection pooling, indexes |
| Concurrent controllers | 50+ | Stateless services, horizontal scale |
| Radar scope frame rate | 30+ fps | Canvas `requestAnimationFrame` |
| Data retention (surveillance) | 30 days | PostgreSQL partitioning (planned) |
| Uptime target | 99.9% | `restart: unless-stopped`, health checks |
| JWT validation overhead | < 5ms | JWKS local cache (10 min TTL) |

---

## 8. Deployment Architecture

```
Production (Kubernetes):

  Ingress (nginx)
      ↓
  api-gateway  (2 replicas)
      ↓
  ┌──────────────────────────────────────────────┐
  │  fdps(2) snet(2) surveillance(3) coord(1)    │
  │  weather(1) analytics(2) ml(2) ingest(2)     │
  └──────────────────────────────────────────────┘
      ↓                    ↓
  PostgreSQL (RDS)      Kafka (3 brokers)
  Redis (ElastiCache)   Keycloak (2 replicas)
```

See [Deployment Guide](DEPLOYMENT.md) for full Kubernetes manifests.

---

## 9. Known Limitations and Future Work

| Item | Priority | Notes |
|------|----------|-------|
| ASTERIX binary parser | HIGH | Current stub needs `node-asterix` library integration |
| Kafka consumer groups per service | HIGH | Services currently do DB-direct fallback |
| PostgreSQL table partitioning on `surveillance_reports` | MEDIUM | Required at > 10M rows/day |
| ONNX-based trained ML models | MEDIUM | Replace rule-based predictors |
| OLDI/AIDC inter-FIR messaging | MEDIUM | Required for cross-FIR coordination |
| Voice communication (VoIP) integration | LOW | Out of scope for v2 |
| Offline mode / PWA for frontend | LOW | Useful for degraded network environments |

---

*Document maintained in `docs/TDD.md`. Submit changes via pull request.*
