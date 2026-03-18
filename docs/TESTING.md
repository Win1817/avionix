# AVIONIX — Testing Strategy

> Test-Driven Development (TDD) approach, test structure, test plans for all services, and test data specifications.

---

## 1. Testing Philosophy

AVIONIX follows a **Test-Driven Development (TDD)** approach for all safety-critical service logic:

1. **Write the test first** — define the expected behavior before implementation
2. **Red** — confirm the test fails
3. **Green** — write the minimum code to pass
4. **Refactor** — clean up without breaking tests

For ATC systems, correctness of conflict detection and separation calculations is non-negotiable. All ML model predictions and geometric calculations must have deterministic test cases derived from real separation scenarios.

---

## 2. Test Pyramid

```
              ┌─────────────┐
              │   E2E (5%)  │  Playwright — full CWP user journeys
              ├─────────────┤
              │Integration  │  Supertest — service REST APIs with real DB
              │   (25%)     │  Kafka consumer/producer integration
              ├─────────────┤
              │  Unit (70%) │  Jest — pure functions, ML models,
              │             │  parsers, helpers, middleware
              └─────────────┘
```

---

## 3. Unit Tests

### 3.1 shared/utils/helpers.js

```javascript
// tests/unit/helpers.test.js

describe('calculateDistanceNM', () => {
  test('known distance RPLL → RJTT ≈ 1,580 NM', () => {
    const dist = calculateDistanceNM(14.5086, 121.0197, 35.7647, 140.3864);
    expect(dist).toBeCloseTo(1580, -1); // within 10 NM
  });

  test('same point returns 0', () => {
    expect(calculateDistanceNM(14.5, 121.0, 14.5, 121.0)).toBe(0);
  });

  test('antipodal points ≈ 10,800 NM', () => {
    const dist = calculateDistanceNM(0, 0, 0, 180);
    expect(dist).toBeCloseTo(10800, -2);
  });
});

describe('isValidCallsign', () => {
  test.each([
    ['PAL101', true],
    ['CEB5J', true],
    ['', false],
    ['PAL', false],
    ['12345', false],
    ['TOOLONG1234X', false],
  ])('%s → %s', (cs, expected) => {
    expect(isValidCallsign(cs)).toBe(expected);
  });
});

describe('isValidAirportCode', () => {
  test.each([
    ['RPLL', true], ['RJTT', true],
    ['rpll', false], ['JFK', false], ['12AB', false],
  ])('%s → %s', (code, expected) => {
    expect(isValidAirportCode(code)).toBe(expected);
  });
});
```

### 3.2 SNET — Conflict Detection

```javascript
// tests/unit/snet/conflict-detection.test.js

describe('determineSeverity', () => {
  test('CRITICAL: H<2NM, V<500ft, TTC<30s', () => {
    expect(determineSeverity(1.5, 400, 25)).toBe('CRITICAL');
  });

  test('HIGH: H<3NM, V<1000ft, TTC<60s', () => {
    expect(determineSeverity(2.5, 800, 55)).toBe('HIGH');
  });

  test('MEDIUM: H<5NM, V<2000ft', () => {
    expect(determineSeverity(4.0, 1500, 200)).toBe('MEDIUM');
  });

  test('LOW: comfortable separation', () => {
    expect(determineSeverity(8.0, 3000, 500)).toBe('LOW');
  });

  test('CRITICAL takes precedence over all thresholds', () => {
    expect(determineSeverity(1.0, 100, 10)).toBe('CRITICAL');
  });
});
```

### 3.3 ML — Conflict Predictor

```javascript
// tests/unit/ml/conflict-predictor.test.js
import { ConflictPredictor } from '../../../snet-service/src/ml/conflict-predictor.js';

describe('ConflictPredictor', () => {
  const predictor = new ConflictPredictor();

  test('extremely close aircraft → high risk (>0.85)', () => {
    const risk = predictor.estimateRisk(1.5, 400, 25, 800);
    expect(risk).toBeGreaterThan(0.85);
  });

  test('well-separated aircraft → low risk (<0.1)', () => {
    const risk = predictor.estimateRisk(15, 5000, 600, 200);
    expect(risk).toBeLessThan(0.1);
  });

  test('classifyRisk CRITICAL for score > 0.85', () => {
    expect(predictor.classifyRisk(0.90)).toBe('CRITICAL');
  });

  test('risk is in range [0, 1]', () => {
    for (let i = 0; i < 20; i++) {
      const r = predictor.estimateRisk(
        Math.random() * 20, Math.random() * 5000,
        Math.random() * 300, Math.random() * 1000
      );
      expect(r).toBeGreaterThanOrEqual(0);
      expect(r).toBeLessThanOrEqual(1);
    }
  });
});
```

### 3.4 ML — Trajectory Predictor

```javascript
// tests/unit/ml/trajectory-predictor.test.js
import { MLTrajectoryPredictor } from '../../../fdps-service/src/ml/trajectory-predictor.js';

describe('MLTrajectoryPredictor', () => {
  const predictor = new MLTrajectoryPredictor();
  const flight = { cruise_altitude: 35000, cruise_speed: 480 };
  const pos = { position_lat: 14.5, position_lon: 121.0, altitude: 30000,
                ground_speed: 450, track_angle: 270, timestamp: new Date().toISOString() };

  test('returns correct number of trajectory points', async () => {
    const { points } = await predictor.predict(flight, pos, 20);
    expect(points).toHaveLength(21); // 0..20 inclusive
  });

  test('first point matches current position approximately', async () => {
    const { points } = await predictor.predict(flight, pos, 20);
    expect(points[0].lat).toBeCloseTo(pos.position_lat, 1);
    expect(points[0].lon).toBeCloseTo(pos.position_lon, 1);
  });

  test('uncertainty radius grows with time', async () => {
    const { points } = await predictor.predict(flight, pos, 20);
    const r0 = points[0].uncertainty_radius_nm;
    const r20 = points[20].uncertainty_radius_nm;
    expect(r20).toBeGreaterThan(r0);
  });

  test('confidence between 0 and 1', async () => {
    const { confidence } = await predictor.predict(flight, pos, 20);
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });
});
```

### 3.5 Data Ingest — ADS-B Parser

```javascript
// tests/unit/parsers/adsb-parser.test.js
import { ADSBParser } from '../../../data-ingest-service/src/parsers/adsb-parser.js';

describe('ADSBParser', () => {
  const parser = new ADSBParser();

  test('parses dump1090 format', () => {
    const result = parser.parse({ flight: 'PAL101 ', hex: '4b1820',
      lat: 14.5, lon: 121.0, altitude: 35000, speed: 480, track: 270, squawk: '2341' });
    expect(result.callsign).toBe('PAL101');
    expect(result.lat).toBe(14.5);
    expect(result.altitude).toBe(35000);
  });

  test('trims whitespace from callsign', () => {
    const result = parser.parse({ flight: '  PAL101  ', lat: 14.5, lon: 121.0 });
    expect(result.callsign).toBe('PAL101');
  });

  test('returns null for missing coordinates', () => {
    expect(parser.parse({ flight: 'PAL101' })).toBeNull();
  });

  test('handles "ground" altitude', () => {
    const result = parser.parse({ flight: 'PAL101', lat: 14.5, lon: 121.0, altitude: 'ground' });
    expect(result.altitude).toBe(0);
  });

  test('parses VRS format (Lat/Long capitalized)', () => {
    const result = parser.parse({ Callsign: 'CEB202', Lat: 15.1, Long: 122.5, Alt: 28000 });
    expect(result.callsign).toBe('CEB202');
    expect(result.lat).toBe(15.1);
    expect(result.altitude).toBe(28000);
  });
});
```

### 3.6 Keycloak Auth Middleware

```javascript
// tests/unit/middleware/keycloak-auth.test.js

describe('authorize middleware', () => {
  const mockNext = jest.fn();

  const makeReq = (roles) => ({ user: { id: 'u1', username: 'test', roles } });

  test('allows request when user has required role', () => {
    const mw = authorize('ATC_CONTROLLER');
    const req = makeReq(['ATC_CONTROLLER']);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mw(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });

  test('rejects request when user lacks required role', () => {
    const mw = authorize('SUPER_ADMIN');
    const req = makeReq(['ATC_TRAINEE']);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mw(req, res, mockNext);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  test('allows when any of multiple roles match', () => {
    const mw = authorize('ATC_SUPERVISOR', 'SUPER_ADMIN');
    const req = makeReq(['ATC_SUPERVISOR']);
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    mw(req, res, mockNext);
    expect(mockNext).toHaveBeenCalled();
  });
});
```

---

## 4. Integration Tests

### 4.1 FDPS Service API

```javascript
// tests/integration/fdps.test.js
import request from 'supertest';
import app from '../../fdps-service/src/index.js';

const AUTH_HEADER = { Authorization: `Bearer ${process.env.TEST_TOKEN}` };

describe('POST /api/fdps/flights', () => {
  const validFlight = {
    callsign: 'TST001', aircraft_type: 'B738', aircraft_registration: 'RP-T001',
    departure_airport: 'RPLL', destination_airport: 'RPVM',
    departure_time: new Date(Date.now() + 3600000).toISOString(),
    cruise_altitude: 10000, cruise_speed: 300, flight_rules: 'I', operator_icao: 'TST'
  };

  test('201 — creates valid flight plan', async () => {
    const res = await request(app).post('/api/fdps/flights')
      .set(AUTH_HEADER).send(validFlight);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.callsign).toBe('TST001');
    expect(res.body.data.status).toBe('FILED');
  });

  test('400 — rejects invalid callsign', async () => {
    const res = await request(app).post('/api/fdps/flights')
      .set(AUTH_HEADER).send({ ...validFlight, callsign: '!!BAD!!' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  test('401 — rejects missing token', async () => {
    const res = await request(app).post('/api/fdps/flights').send(validFlight);
    expect(res.status).toBe(401);
  });
});

describe('GET /api/fdps/flights', () => {
  test('200 — returns active flights array', async () => {
    const res = await request(app).get('/api/fdps/flights?status=ACTIVE').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
```

### 4.2 SNET Conflict Detection

```javascript
// tests/integration/snet.test.js

describe('POST /api/snet/detect-conflicts', () => {
  test('returns totalFlights and conflicts array', async () => {
    const res = await request(app).post('/api/snet/detect-conflicts').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('totalFlights');
    expect(res.body.data).toHaveProperty('conflictsDetected');
    expect(Array.isArray(res.body.data.conflicts)).toBe(true);
  });

  test('each conflict has required fields', async () => {
    const res = await request(app).post('/api/snet/detect-conflicts').set(AUTH_HEADER);
    res.body.data.conflicts.forEach(c => {
      expect(c).toHaveProperty('flight1');
      expect(c).toHaveProperty('horizontalDistance');
      expect(c).toHaveProperty('severity');
      expect(['CRITICAL','HIGH','MEDIUM','LOW']).toContain(c.severity);
    });
  });
});
```

### 4.3 Surveillance Picture

```javascript
describe('GET /api/surveillance/picture', () => {
  test('200 — returns count and tracks array', async () => {
    const res = await request(app).get('/api/surveillance/picture').set(AUTH_HEADER);
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('count');
    expect(Array.isArray(res.body.data.tracks)).toBe(true);
  });
});
```

---

## 5. E2E Tests (Playwright)

```javascript
// tests/e2e/cwp-login.spec.js
import { test, expect } from '@playwright/test';

test.describe('CWP — Controller Login and Dashboard', () => {
  test('controller can log in and see radar scope', async ({ page }) => {
    await page.goto('http://localhost:5173');
    // Redirected to Keycloak
    await expect(page).toHaveURL(/keycloak/);
    await page.fill('#username', 'controller1');
    await page.fill('#password', process.env.TEST_CONTROLLER_PASS);
    await page.click('#kc-login');
    // Back to dashboard
    await expect(page).toHaveURL(/cwp/);
    await expect(page.locator('.radar-canvas')).toBeVisible();
    await expect(page.locator('.strips-panel')).toBeVisible();
    await expect(page.locator('.alerts-panel')).toBeVisible();
  });

  test('alert appears on panel when STCA is triggered', async ({ page }) => {
    // Pre-seed conflict via API, then check UI
    await page.goto('http://localhost:5173/cwp');
    const alertPanel = page.locator('.alert-item').first();
    await alertPanel.waitFor({ timeout: 10000 });
    await expect(alertPanel.locator('.alert-type')).toBeVisible();
  });

  test('trainee cannot access coordination page', async ({ page }) => {
    await loginAs(page, 'trainee1');
    await page.goto('http://localhost:5173/coordination');
    // Coordination not in nav for trainee
    await expect(page.locator('.nav-item[href="/coordination"]')).not.toBeVisible();
  });
});
```

---

## 6. Test Data Specifications

### 6.1 Standard Test Flight

```json
{
  "callsign": "TST001",
  "aircraft_type": "B738",
  "departure_airport": "RPLL",
  "destination_airport": "RPVM",
  "cruise_altitude": 10000,
  "cruise_speed": 300,
  "departure_time": "<NOW + 1h>"
}
```

### 6.2 Conflict Scenario

Two flights on converging tracks at the same altitude:
```json
[
  { "callsign": "TST001", "lat": 14.5, "lon": 121.0, "altitude": 35000, "heading": 090, "speed": 450 },
  { "callsign": "TST002", "lat": 14.5, "lon": 121.3, "altitude": 35000, "heading": 270, "speed": 450 }
]
```
Expected: horizontal separation = ~14 NM (approaching), MEDIUM alert within 2 position updates.

### 6.3 Emergency Squawk

```json
{ "callsign": "TST003", "squawk": "7700", "lat": 15.0, "lon": 122.0, "altitude": 25000 }
```
Expected: appears in `/surveillance/squawks/emergency` within 30 seconds.

---

## 7. Running Tests

```bash
# Unit tests for all services
cd fdps-service && npm test
cd snet-service && npm test
cd data-ingest-service && npm test

# Integration tests (requires running DB)
DB_HOST=localhost npm test -- --testPathPattern=integration

# E2E tests (requires full stack)
cd tests/e2e && npx playwright test

# Coverage report
npm test -- --coverage
```

### CI Pipeline
GitHub Actions runs on every push:
1. `npm ci` for each service
2. `npm run lint`
3. `npm test`
4. Docker build
5. Trivy security scan

See `.github/workflows/ci.yml`.
