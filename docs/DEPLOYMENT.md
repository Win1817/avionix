# AVIONIX — Deployment Guide

---

## 1. Local Development (Docker Compose)

### Prerequisites
- Docker 24+ with Docker Compose v2
- 8 GB RAM (16 GB recommended)
- 20 GB free disk

### Steps

```bash
# 1. Clone repo
git clone https://github.com/Win1817/avionix.git && cd avionix

# 2. Configure environment
cp .env.example .env
# Edit .env — set all *_PASSWORD values

# 3. Start full stack
docker compose up -d

# 4. Check all services healthy
docker compose ps

# 5. Tail logs
docker compose logs -f api-gateway frontend
```

### Service startup order
```
postgres → keycloak → kafka → services → api-gateway → frontend
```
Keycloak takes ~90 seconds to start. Services will retry until it is available.

### URLs after startup
| Service | URL |
|---------|-----|
| ATC Dashboard | http://localhost:5173 |
| API Gateway | http://localhost:4000/health |
| Keycloak Admin | http://localhost:8080/admin |
| Kafka UI | http://localhost:8090 |
| Grafana | http://localhost:3000 |
| Prometheus | http://localhost:9090 |

---

## 2. Environment Variables Reference

```env
# Database
DB_HOST=postgres
DB_PORT=5432
DB_NAME=avionix
DB_USER=avionix
DB_PASSWORD=<strong_password>
DB_POOL_MAX=20

# Keycloak
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=avionix
KEYCLOAK_CLIENT_ID=avionix-services
KEYCLOAK_CLIENT_SECRET=<secret>
KEYCLOAK_ADMIN=admin
KEYCLOAK_ADMIN_PASSWORD=<strong_password>
KC_HOSTNAME=localhost
KC_DB_PASSWORD=<strong_password>

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=<strong_password>

# Kafka
KAFKA_BROKERS=kafka:29092

# Service ports
FDPS_PORT=3001
SNET_PORT=3002
SURVEILLANCE_PORT=3003
COORDINATION_PORT=3004
WEATHER_PORT=3005
ANALYTICS_PORT=3006
ML_PORT=3007
INGEST_PORT=3008
GATEWAY_PORT=4000

# Monitoring
GRAFANA_PASSWORD=<password>
```

---

## 3. First User Setup

After Keycloak starts, create the first controller:

```bash
# Get admin token
TOKEN=$(curl -s -X POST http://localhost:8080/realms/master/protocol/openid-connect/token \
  -d "client_id=admin-cli&grant_type=password&username=admin&password=${KEYCLOAK_ADMIN_PASSWORD}" \
  | jq -r '.access_token')

# Create user
curl -X POST http://localhost:8080/admin/realms/avionix/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"username":"controller1","email":"c1@atc.local","enabled":true,
       "credentials":[{"type":"password","value":"Control1!","temporary":false}]}'

# Assign ATC_CONTROLLER role (get user ID first)
USER_ID=$(curl -s http://localhost:8080/admin/realms/avionix/users?username=controller1 \
  -H "Authorization: Bearer $TOKEN" | jq -r '.[0].id')

ROLE_ID=$(curl -s http://localhost:8080/admin/realms/avionix/roles/ATC_CONTROLLER \
  -H "Authorization: Bearer $TOKEN" | jq -r '.id')

curl -X POST http://localhost:8080/admin/realms/avionix/users/$USER_ID/role-mappings/realm \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "[{\"id\":\"$ROLE_ID\",\"name\":\"ATC_CONTROLLER\"}]"
```

---

## 4. Sending Test Data

### ADS-B positions
```bash
# Get controller token
TOKEN=$(curl -s -X POST http://localhost:8080/realms/avionix/protocol/openid-connect/token \
  -d "client_id=avionix-frontend&grant_type=password&username=controller1&password=Control1!" \
  | jq -r '.access_token')

# Ingest positions
curl -X POST http://localhost:3008/ingest/adsb \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "aircraft": [
      {"flight":"PAL101","hex":"4b1820","lat":14.5995,"lon":121.0197,"altitude":35000,"speed":450,"track":270,"squawk":"2341"},
      {"flight":"CEB202","hex":"4b1821","lat":15.1234,"lon":120.5678,"altitude":35000,"speed":430,"track":090,"squawk":"4421"},
      {"flight":"AAL300","hex":"4b1822","lat":13.9876,"lon":122.1234,"altitude":28000,"speed":410,"track":180,"squawk":"3301"}
    ]
  }'
```

### File a flight plan
```bash
curl -X POST http://localhost:4000/api/fdps/flights \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "callsign":"PAL101","aircraft_type":"B77W","departure_airport":"RPLL",
    "destination_airport":"RJTT","departure_time":"2025-06-01T08:00:00Z",
    "cruise_altitude":35000,"cruise_speed":480,"flight_rules":"I","operator_icao":"PAL"
  }'
```

---

## 5. Production Deployment (Kubernetes)

### Namespace and secrets
```yaml
# k8s/namespace.yaml
apiVersion: v1
kind: Namespace
metadata:
  name: avionix

---
# k8s/secrets.yaml
apiVersion: v1
kind: Secret
metadata:
  name: avionix-secrets
  namespace: avionix
type: Opaque
stringData:
  DB_PASSWORD: "<strong_password>"
  KC_DB_PASSWORD: "<strong_password>"
  KEYCLOAK_ADMIN_PASSWORD: "<strong_password>"
  REDIS_PASSWORD: "<strong_password>"
  KEYCLOAK_CLIENT_SECRET: "<strong_secret>"
```

### Example service deployment
```yaml
# k8s/fdps-service.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fdps-service
  namespace: avionix
spec:
  replicas: 2
  selector:
    matchLabels:
      app: fdps-service
  template:
    metadata:
      labels:
        app: fdps-service
    spec:
      containers:
      - name: fdps-service
        image: ghcr.io/win1817/avionix-fdps-service:latest
        ports:
        - containerPort: 3001
        env:
        - name: DB_PASSWORD
          valueFrom:
            secretKeyRef:
              name: avionix-secrets
              key: DB_PASSWORD
        - name: KEYCLOAK_URL
          value: "http://keycloak-service:8080"
        readinessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 15
          periodSeconds: 10
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 30
---
apiVersion: v1
kind: Service
metadata:
  name: fdps-service
  namespace: avionix
spec:
  selector:
    app: fdps-service
  ports:
  - port: 3001
    targetPort: 3001
```

### Ingress
```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: avionix-ingress
  namespace: avionix
  annotations:
    nginx.ingress.kubernetes.io/proxy-read-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "3600"
    nginx.ingress.kubernetes.io/proxy-buffering: "off"
spec:
  rules:
  - host: atc.yourdomain.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-gateway
            port:
              number: 4000
      - path: /ws
        pathType: Prefix
        backend:
          service:
            name: api-gateway
            port:
              number: 4000
      - path: /
        pathType: Prefix
        backend:
          service:
            name: frontend
            port:
              number: 80
```

---

## 6. Production Hardening Checklist

- [ ] All `.env` passwords set to cryptographically random values (32+ chars)
- [ ] Keycloak `KC_HOSTNAME_STRICT=true` in production
- [ ] TLS termination at ingress level (cert-manager + Let's Encrypt)
- [ ] Database SSL enabled (`DB_SSL=true`)
- [ ] Redis authentication enabled
- [ ] Keycloak brute force protection enabled (already in realm export)
- [ ] JWT `accessTokenLifespan` set to 300 seconds (5 min) — already configured
- [ ] Kafka topic replication factor = 3 for production brokers
- [ ] PostgreSQL daily backups configured (pg_dump or RDS snapshots)
- [ ] `surveillance_reports` table partitioned by month for high-volume FIRs
- [ ] Prometheus alerting rules configured for service downtime
- [ ] Grafana dashboards imported from `infrastructure/grafana/`
- [ ] Rate limiting tuned per environment
- [ ] CORS origin locked to production domain
- [ ] Docker image vulnerability scanning in CI (Trivy — already in `ci.yml`)
- [ ] Secrets rotated and never committed to git

---

## 7. Scaling Guidelines

| Service | Scale trigger | Max replicas |
|---------|--------------|-------------|
| surveillance-service | > 500 positions/sec | 5 |
| snet-service | > 50 active alerts | 3 |
| fdps-service | > 200 active flights | 3 |
| api-gateway | > 200 concurrent WS clients | 4 |
| analytics-service | query latency > 500ms | 3 |
| ml-service | inference latency > 200ms | 4 |

Kafka consumer groups allow each service replica to independently process events without duplication.
