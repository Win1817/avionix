# AVIONIX — Security Model

---

## 1. Authentication Architecture

AVIONIX uses **Keycloak 23** as the Identity Provider (IdP) with **OpenID Connect / OAuth 2.0** for all authentication flows.

### Token Flow

```
1. User opens frontend (http://localhost:5173)
2. Keycloak JS adapter checks for existing SSO session (silent check-sso)
3. No session → redirect to Keycloak login page (http://localhost:8080/realms/avionix/...)
4. User authenticates (username/password or MFA)
5. Keycloak issues signed JWT (RS256, 5-minute TTL) + refresh token (30-minute TTL)
6. Frontend stores token in React state (NOT localStorage — prevents XSS token theft)
7. All API requests include: Authorization: Bearer <jwt>
8. api-gateway validates JWT signature against Keycloak JWKS endpoint
9. JWKS response is cached locally for 10 minutes (reduces Keycloak load)
10. Validated claims attached to req.user (id, username, roles, sector)
11. Service-level authorize() checks required roles
12. Token refresh runs every 4 minutes via Keycloak updateToken(60)
```

---

## 2. RBAC Permission Matrix

| Resource | SUPER_ADMIN | ATC_SUPERVISOR | ATC_CONTROLLER | ATC_TRAINEE | PILOT | OPS_MGR | SAFETY_OFFICER | DATA_ANALYST |
|----------|:-----------:|:--------------:|:--------------:|:-----------:|:-----:|:-------:|:--------------:|:------------:|
| File flight plan | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Update flight | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View active flights | ✅ | ✅ | ✅ | ✅ | Own only | ✅ | ✅ | ✅ |
| Assign sector | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View alerts | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ |
| Dismiss alert | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Initiate handoff | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Issue clearance | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Ingest positions | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View surveillance | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ |
| Issue SIGMET | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Submit PIREP | ✅ | ✅ | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ |
| View analytics KPIs | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ | ✅ |
| View controller workload | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| ML conflict predict | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| ML airspace assess | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Manage users | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 3. Sector-Level Authorization

Beyond role checks, controllers are restricted to their assigned sector:

```javascript
// Middleware: authorizeSector
if (req.user.roles.includes('ATC_SUPERVISOR') || req.user.roles.includes('SUPER_ADMIN')) {
  return next(); // supervisors bypass sector restriction
}
if (req.user.sector && req.user.sector !== requestedSector) {
  return res.status(403).json({ error: 'FORBIDDEN', message: `You are assigned to ${req.user.sector}` });
}
```

The controller's sector is embedded in their Keycloak token claim and cannot be spoofed without a valid signed JWT.

---

## 4. Rate Limiting

| Layer | Limit | Window | Applies to |
|-------|-------|--------|------------|
| API Gateway | 500 req | 60s | All authenticated users |
| Individual services | 200 req | 60s | Per user per service |
| Data Ingest | 100 req | 60s | Ingest sources |

Limits are per user ID (from JWT `sub` claim). Unauthenticated requests are rejected before rate limiting.

---

## 5. Threat Model

### T1 — Unauthorized Flight Modification
**Attack:** Malicious user modifies another controller's flight via API.  
**Mitigation:** JWT required; role check (CONTROLLER+); sector ownership check prevents cross-sector modification.

### T2 — Alert Injection / Suppression
**Attack:** Attacker injects false STCA alerts or dismisses real ones.  
**Mitigation:** Alert generation requires ATC_CONTROLLER role; all dismissals are logged with `dismissed_by` user ID and `resolution_action`.

### T3 — Token Replay
**Attack:** Stolen JWT replayed after expiry.  
**Mitigation:** 5-minute JWT TTL; Keycloak supports token revocation; `revokeRefreshToken: true` in realm config.

### T4 — Kafka Poisoning
**Attack:** Attacker publishes fake position reports to Kafka.  
**Mitigation:** Only `data-ingest-service` publishes to position topics; Kafka topic ACLs (configure in production); ingest endpoint requires SUPER_ADMIN role.

### T5 — Database Injection
**Attack:** SQL injection via API parameters.  
**Mitigation:** All queries use parameterized prepared statements (`$1, $2` placeholders). No string concatenation in SQL.

### T6 — XSS Token Theft
**Attack:** XSS script reads localStorage JWT.  
**Mitigation:** Tokens stored in React state (memory), not localStorage. `Content-Security-Policy` headers recommended for production nginx.

### T7 — Insecure Direct Object Reference
**Attack:** Controller accesses other user's flight by guessing UUID.  
**Mitigation:** UUIDs are non-sequential (random). Sector ownership check prevents cross-sector reads on mutation endpoints.

---

## 6. Audit Trail

All state-changing operations are logged with:
- Timestamp (ISO 8601 UTC)
- User ID and username (from JWT)
- Operation type
- Resource ID
- Result

Logs are structured JSON, piped to stdout for collection by log aggregators (Loki, ELK, CloudWatch).

Critical events stored in DB:
- Alert dismissals (`safety_alerts.dismissed_by`, `dismissal_time`, `resolution_action`)
- Clearances (`clearances.issued_by`, `issued_at`)
- Handoff lifecycle (`handoffs.initiated_by`, `accepted_by`)
- Flight status changes (`flights.updated_at`)

---

## 7. Secrets Management

- All credentials in `.env` (git-ignored)
- Keycloak client secrets rotatable without code changes
- No secrets in Docker images or source code
- In production: use Kubernetes Secrets or HashiCorp Vault
- Keycloak realm export (`keycloak/realm-export.json`) contains NO secrets — passwords are injected at runtime
