// snet-service/src/index.js
// AVIONIX Safety Nets Service (SNET)
// STCA, MSAW, APW alert generation with ML conflict probability

import express from 'express';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { createLogger, createSuccessResponse, createErrorResponse,
  calculateDistanceNM, ALERT_TYPE, ALERT_SEVERITY, DEFAULT_SEPARATION_MINIMA
} from '../../shared/utils/helpers.js';
import { authenticate, authorize, requestLogger, errorHandler, notFound } from '../../shared/middleware/keycloak-auth.js';
import { query, queryOne, queryAll } from '../../shared/db/connection.js';
import { ConflictPredictor } from './ml/conflict-predictor.js';

dotenv.config();
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const logger = createLogger('SNET');
const predictor = new ConflictPredictor();

// WebSocket clients indexed by controller session
const wsClients = new Map();
wss.on('connection', (ws, req) => {
  const sessionId = req.url?.split('session=')[1] || 'anon';
  wsClients.set(sessionId, ws);
  ws.on('close', () => wsClients.delete(sessionId));
  logger.info(`WS connected: session=${sessionId}`);
});

const broadcastAlert = (alert) => {
  const payload = JSON.stringify({ type: 'ALERT', data: alert });
  wsClients.forEach((ws) => { if (ws.readyState === 1) ws.send(payload); });
};

app.use(express.json());
app.use(requestLogger);
app.use('/api/snet', authenticate);

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({ status: 'healthy', service: 'snet', wsClients: wsClients.size }));

// ─── ALERTS ──────────────────────────────────────────────────────────────────
app.get('/api/snet/alerts',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'ATC_TRAINEE', 'SAFETY_OFFICER', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { severity, type, limit = 100, offset = 0 } = req.query;
      let q = 'SELECT * FROM safety_alerts WHERE is_active=TRUE';
      const params = [];
      if (severity) { params.push(severity); q += ` AND severity=$${params.length}`; }
      if (type) { params.push(type); q += ` AND alert_type=$${params.length}`; }
      params.push(limit, offset);
      q += ` ORDER BY detection_time DESC LIMIT $${params.length - 1} OFFSET $${params.length}`;
      const alerts = await queryAll(q, params);
      res.json(createSuccessResponse(alerts));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

app.post('/api/snet/generate-alert',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { alertType, severity, flightIdPrimary, flightIdSecondary,
        horizontalDistance, verticalDistance, timeToCollision, description, metadata = {} } = req.body;

      if (!Object.values(ALERT_TYPE).includes(alertType))
        return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Invalid alert type'));

      const flights = await queryAll('SELECT id,callsign FROM flights WHERE id=$1 OR id=$2',
        [flightIdPrimary, flightIdSecondary]);

      const f1 = flights.find(f => f.id === flightIdPrimary);
      const f2 = flights.find(f => f.id === flightIdSecondary);

      const alert = await queryOne(`
        INSERT INTO safety_alerts (alert_type, severity, flight_id_primary, flight_id_secondary,
          callsign_primary, callsign_secondary, alert_description,
          horizontal_distance, vertical_distance, time_to_collision, is_active, alert_metadata)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE,$11) RETURNING *`,
        [alertType, severity, flightIdPrimary, flightIdSecondary,
          f1?.callsign, f2?.callsign, description,
          horizontalDistance, verticalDistance, timeToCollision, JSON.stringify(metadata)]);

      broadcastAlert(alert);
      logger.warn(`Alert created [${severity}] ${alertType}: ${f1?.callsign} vs ${f2?.callsign}`);
      res.status(201).json(createSuccessResponse(alert, 'Alert generated'));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

app.put('/api/snet/alerts/:alertId/dismiss',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { resolutionAction } = req.body;
      const alert = await queryOne(`
        UPDATE safety_alerts SET is_active=FALSE, dismissal_time=NOW(),
          dismissed_by=$1, resolution_action=COALESCE($2,resolution_action)
        WHERE id=$3 RETURNING *`,
        [req.user.id, resolutionAction, req.params.alertId]);
      if (!alert) return res.status(404).json(createErrorResponse('NOT_FOUND', 'Alert not found'));
      logger.info(`Alert dismissed: ${req.params.alertId}`, { user: req.user.username });
      res.json(createSuccessResponse(alert, 'Alert dismissed'));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── STCA - SHORT TERM CONFLICT ALERT ────────────────────────────────────────
app.post('/api/snet/detect-conflicts',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const activeFlights = await queryAll(`
        SELECT f.id, f.callsign, f.aircraft_type,
               sr.position_lat, sr.position_lon, sr.altitude,
               sr.ground_speed, sr.track_angle, sr.timestamp
        FROM flights f
        JOIN surveillance_reports sr ON f.id=sr.flight_id
        WHERE f.status='ACTIVE'
          AND sr.timestamp=(SELECT MAX(timestamp) FROM surveillance_reports WHERE flight_id=f.id)
          AND sr.timestamp > NOW()-INTERVAL '2 minutes'`);

      const conflicts = [];
      const seen = new Set();

      for (let i = 0; i < activeFlights.length; i++) {
        for (let j = i + 1; j < activeFlights.length; j++) {
          const a = activeFlights[i], b = activeFlights[j];
          const key = `${a.id}-${b.id}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const hDist = calculateDistanceNM(a.position_lat, a.position_lon, b.position_lat, b.position_lon);
          const vDist = Math.abs(a.altitude - b.altitude);
          const m = DEFAULT_SEPARATION_MINIMA;

          if (hDist < m.HORIZONTAL_ENROUTE && vDist < m.VERTICAL_ENROUTE) {
            const relSpeed = Math.sqrt(a.ground_speed ** 2 + b.ground_speed ** 2);
            const ttc = (hDist / (relSpeed / 3600)) * 60;
            const severity = determineSeverity(hDist, vDist, ttc);
            const mlRisk = predictor.estimateRisk(hDist, vDist, ttc, relSpeed);

            const conflict = {
              flight1Id: a.id, flight2Id: b.id,
              flight1: a.callsign, flight2: b.callsign,
              horizontalDistance: hDist, verticalDistance: vDist,
              timeToCollision: Math.max(0, ttc), severity, mlRiskScore: mlRisk
            };
            conflicts.push(conflict);

            if (severity === ALERT_SEVERITY.CRITICAL || severity === ALERT_SEVERITY.HIGH) {
              await createSTCA(a.id, b.id, conflict);
            }
          }
        }
      }

      res.json(createSuccessResponse({
        totalFlights: activeFlights.length,
        conflictsDetected: conflicts.length,
        conflicts
      }));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── MSAW - MINIMUM SAFE ALTITUDE WARNING ────────────────────────────────────
app.post('/api/snet/check-msaw',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const lowFlights = await queryAll(`
        SELECT f.callsign, sr.altitude, sr.position_lat, sr.position_lon
        FROM flights f JOIN surveillance_reports sr ON f.id=sr.flight_id
        WHERE f.status='ACTIVE' AND sr.altitude < 2500
          AND sr.timestamp > NOW()-INTERVAL '1 minute'`);

      const warnings = lowFlights.map(f => ({
        callsign: f.callsign, altitude: f.altitude,
        lat: f.position_lat, lon: f.position_lon,
        type: ALERT_TYPE.MSAW,
        severity: f.altitude < 1000 ? ALERT_SEVERITY.CRITICAL : ALERT_SEVERITY.HIGH
      }));

      res.json(createSuccessResponse({ count: warnings.length, warnings }));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── SEPARATION CHECK ─────────────────────────────────────────────────────────
app.post('/api/snet/check-separation', authenticate, async (req, res) => {
  try {
    const { flightId1, flightId2 } = req.body;
    const [p1, p2] = await Promise.all([
      queryOne(`SELECT f.callsign, sr.position_lat, sr.position_lon, sr.altitude
        FROM flights f JOIN surveillance_reports sr ON f.id=sr.flight_id
        WHERE f.id=$1 ORDER BY sr.timestamp DESC LIMIT 1`, [flightId1]),
      queryOne(`SELECT f.callsign, sr.position_lat, sr.position_lon, sr.altitude
        FROM flights f JOIN surveillance_reports sr ON f.id=sr.flight_id
        WHERE f.id=$1 ORDER BY sr.timestamp DESC LIMIT 1`, [flightId2])
    ]);
    if (!p1 || !p2) return res.status(404).json(createErrorResponse('NOT_FOUND', 'Flight not found'));

    const hDist = calculateDistanceNM(p1.position_lat, p1.position_lon, p2.position_lat, p2.position_lon);
    const vDist = Math.abs(p1.altitude - p2.altitude);
    const m = DEFAULT_SEPARATION_MINIMA;

    res.json(createSuccessResponse({
      flight1: p1.callsign, flight2: p2.callsign,
      horizontalDistance: hDist, verticalDistance: vDist,
      requiredHorizontal: m.HORIZONTAL_ENROUTE, requiredVertical: m.VERTICAL_ENROUTE,
      horizontalOK: hDist >= m.HORIZONTAL_ENROUTE,
      verticalOK: vDist >= m.VERTICAL_ENROUTE,
      violates: hDist < m.HORIZONTAL_ENROUTE && vDist < m.VERTICAL_ENROUTE
    }));
  } catch (e) {
    res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
  }
});

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const determineSeverity = (h, v, ttc) => {
  if (h < 2 && v < 500 && ttc < 30) return ALERT_SEVERITY.CRITICAL;
  if (h < 3 && v < 1000 && ttc < 60) return ALERT_SEVERITY.HIGH;
  if (h < 5 && v < 2000) return ALERT_SEVERITY.MEDIUM;
  return ALERT_SEVERITY.LOW;
};

const createSTCA = async (id1, id2, conflict) => {
  try {
    const alert = await queryOne(`
      INSERT INTO safety_alerts (alert_type, severity, flight_id_primary, flight_id_secondary,
        callsign_primary, callsign_secondary, alert_description,
        horizontal_distance, vertical_distance, time_to_collision, is_active)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,TRUE) RETURNING *`,
      [ALERT_TYPE.STCA, conflict.severity, id1, id2, conflict.flight1, conflict.flight2,
        `STCA: ${conflict.flight1} vs ${conflict.flight2}`,
        conflict.horizontalDistance, conflict.verticalDistance, conflict.timeToCollision]);
    broadcastAlert(alert);
    logger.warn(`STCA [${conflict.severity}]: ${conflict.flight1} vs ${conflict.flight2}`);
  } catch (e) {
    logger.error('STCA creation failed', { error: e.message });
  }
};

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.SNET_PORT || 3002;
server.listen(PORT, () => logger.info(`SNET running on port ${PORT} (WS enabled)`));

export default app;
