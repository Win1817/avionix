# ✈ AVIONIX — Air Traffic Control Management System

> **Production-grade ATC platform** built on a microservices architecture with real-time radar surveillance, AI-powered conflict detection, Keycloak RBAC authentication, and a full Controller Working Position (CWP) dashboard.

[![CI/CD](https://github.com/Win1817/avionix/actions/workflows/ci.yml/badge.svg)](https://github.com/Win1817/avionix/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-20-brightgreen)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)](https://postgresql.org)
[![Kafka](https://img.shields.io/badge/Apache_Kafka-7.6-black)](https://kafka.apache.org)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Services](#services)
- [Quick Start](#quick-start)
- [Documentation](#documentation)
- [Technology Stack](#technology-stack)
- [Port Reference](#port-reference)

---

## Overview

AVIONIX is a comprehensive Air Traffic Control (ATC) management platform designed for Flight Information Regions (FIRs). It provides:

- **Real-time surveillance** — ADS-B, SSR Mode A/C/S, MLAT, ADS-C position ingestion
- **Safety nets** — STCA, MSAW, APW alerts with sub-second detection latency
- **4D trajectory prediction** — ML-enhanced kinematic model with wind correction
- **Controller Working Position** — Canvas-based radar scope with live tracks and velocity vectors
- **Keycloak RBAC** — 9 roles from SUPER_ADMIN to PILOT with sector-level enforcement
- **Machine learning** — Conflict prediction, anomaly detection, demand forecasting, airspace risk scoring
- **Analytics dashboard** — Real-time KPIs, safety trends, workload scoring, delay analysis

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL DATA FEEDS                          │
│   ADS-B (dump1090)   ASTERIX CAT021/048   FIXM 4.3 Flight Plans    │
└──────────────────────────────┬──────────────────────────────────────┘
                               ↓
                  ┌────────────────────────┐
                  │   data-ingest-service  │  :3008
                  │  Normalize → Kafka     │
                  └────────────┬───────────┘
                               ↓
                  ┌────────────────────────┐
                  │        KAFKA           │  :9092
                  │  avionix.surveillance  │
                  │  avionix.flights.*     │
                  │  avionix.weather.*     │
                  └────────────┬───────────┘
          ┌──────────┬─────────┼──────────┬──────────┐
          ↓          ↓         ↓          ↓          ↓
      fdps       snet    surveillance  analytics   weather
      :3001      :3002      :3003        :3006      :3005
          │          │         │
          └──────────┴─────────┘
                     ↓
         ┌───────────────────────┐
         │      PostgreSQL 16    │  :5432
         │   17 tables, PostGIS  │
         └───────────────────────┘
                     ↑
         ┌───────────────────────┐       ┌──────────────────┐
         │     api-gateway       │◄──────│    Keycloak SSO  │
         │  HTTP proxy + WS agg  │  :4000│    RBAC :8080    │
         └───────────────────────┘       └──────────────────┘
                     ↑
         ┌───────────────────────┐
         │      frontend         │  :5173
         │  React CWP Dashboard  │
         └───────────────────────┘
```

---

## Services

| Service | Port | Purpose |
|---------|------|---------|
| `data-ingest-service` | 3008 | ADS-B / ASTERIX / FIXM ingest → Kafka |
| `fdps-service` | 3001 | Flight Data Processing — flight plans, 4D trajectories |
| `snet-service` | 3002 | Safety Nets — STCA / MSAW / APW alerts + WebSocket |
| `surveillance-service` | 3003 | Position tracking, ADS-B feed, radar picture |
| `coordination-service` | 3004 | Sector handoffs, clearances, FIR coordination |
| `weather-service` | 3005 | METAR / TAF / SIGMET / PIREP + ML hazard prediction |
| `analytics-service` | 3006 | KPIs, safety trends, workload, traffic flow |
| `ml-service` | 3007 | Centralized ML inference API |
| `api-gateway` | 4000 | Single entry point — proxy + WS aggregator |
| `keycloak` | 8080 | Authentication + RBAC |
| `frontend` | 5173 | Controller Working Position dashboard |
| `kafka` | 9092 | Event streaming backbone |
| `kafka-ui` | 8090 | Kafka topic browser |
| `grafana` | 3000 | Metrics dashboards |
| `prometheus` | 9090 | Metrics scraping |

---

## Quick Start

### Prerequisites
- Docker 24+ and Docker Compose v2
- 8 GB RAM minimum (16 GB recommended)
- 20 GB disk space

### 1. Clone and configure

```bash
git clone https://github.com/Win1817/avionix.git
cd avionix
cp .env.example .env
# Edit .env — set all passwords
```

### 2. Start the full stack

```bash
docker compose up -d
```

### 3. Wait for Keycloak (~90s), then open

| Interface | URL |
|-----------|-----|
| ATC Dashboard | http://localhost:5173 |
| Keycloak Admin | http://localhost:8080/admin (admin / your password) |
| Kafka UI | http://localhost:8090 |
| Grafana | http://localhost:3000 |
| API Gateway | http://localhost:4000/health |

### 4. Create your first controller user

```bash
# In Keycloak Admin → avionix realm → Users → Add user
# Assign role: ATC_CONTROLLER
# Set a password under Credentials tab
```

### 5. Ingest test ADS-B data

```bash
curl -X POST http://localhost:3008/ingest/adsb \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"aircraft":[{"flight":"PAL101","hex":"4b1820","lat":14.5,"lon":121.0,"altitude":35000,"speed":450,"track":270,"squawk":"2341"}]}'
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [Architecture](docs/ARCHITECTURE.md) | System design, data flows, component interactions |
| [Technical Design Document](docs/TDD.md) | Design decisions, patterns, constraints |
| [Service Descriptions](docs/SERVICE_DESCRIPTIONS.md) | Per-service responsibilities, APIs, Kafka topics |
| [API Reference](docs/API_REFERENCE.md) | All REST endpoints with request/response schemas |
| [Deployment Guide](docs/DEPLOYMENT.md) | Docker, Kubernetes, production hardening |
| [Security Model](docs/SECURITY.md) | Keycloak RBAC, JWT flow, threat model |
| [Testing Strategy](docs/TESTING.md) | TDD approach, unit/integration/E2E test plans |
| [Glossary](docs/GLOSSARY.md) | ATC terminology and system-specific terms |

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 20 (ESM) |
| Framework | Express 4 |
| Frontend | React 18, Vite 5, Redux Toolkit |
| Auth | Keycloak 23 + `jwks-rsa` JWT validation |
| Database | PostgreSQL 16 + PostGIS |
| Messaging | Apache Kafka 7.6 (KafkaJS) |
| Cache | Redis 7 |
| Radar Display | HTML5 Canvas (custom renderer) |
| Charts | Recharts |
| Maps | Leaflet + React-Leaflet |
| Container | Docker + Docker Compose v2 |
| Monitoring | Prometheus + Grafana |
| CI/CD | GitHub Actions + Trivy |

---

## Port Reference

```
3000  Grafana
3001  FDPS Service
3002  SNET Service
3003  Surveillance Service
3004  Coordination Service
3005  Weather Service
3006  Analytics Service
3007  ML Service
3008  Data Ingest Service
4000  API Gateway  ← frontend talks here
5173  Frontend (CWP)
5432  PostgreSQL
6379  Redis
8080  Keycloak
8090  Kafka UI
9090  Prometheus
9092  Kafka
```

---

## License

MIT © 2025 AVIONIX Project
