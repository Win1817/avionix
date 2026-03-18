// surveillance-service/src/index.js
// AVIONIX Surveillance Service
// Ingests ADS-B, SSR (Mode A/C/S), MLAT, and ADS-C position reports

import express from 'express';
import dotenv from 'dotenv';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import { createLogger, createSuccessResponse, createErrorResponse } from '../../shared/utils/helpers.js';
import { authenticate, authorize, requestLogger, errorHandler, notFound } from '../../shared/middleware/keycloak-auth.js';
import { query, queryOne, queryAll, healthCheck } from '../../shared/db/connection.js';

dotenv.config();
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });
const logger = createLogger('SURVEILLANCE');

const positionSubscribers = new Set();
wss.on('connection', (ws) => {
  positionSubscribers.add(ws);
  ws.send(JSON.stringify({ type: 'CONNECTED', message: 'Surveillance feed active' }));
  ws.on('close', () => positionSubscribers.delete(ws));
});

const broadcastPosition = (report) => {
  const payload = JSON.stringify({ type: 'POSITION_UPDATE', data: report });
  positionSubscribers.forEach(ws => { if (ws.readyState === 1) ws.send(payload); });
};

app.use(express.json());
app.use(requestLogger);
app.use('/api/surveillance', authenticate);

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const db = await healthCheck();
    res.json({ status: 'healthy', service: 'surveillance', db, subscribers: positionSubscribers.size });
  } catch (e) {
    res.status(503).json({ status: 'unhealthy', error: e.message });
  }
});

// ─── POSITION INGEST (ADS-B / Radar) ─────────────────────────────────────────
app.post('/api/surveillance/positions',
  authorize('SUPER_ADMIN', 'ATC_SUPERVISOR'), // Only trusted feeder sources
  async (req, res) => {
    try {
      const { source, reports } = req.body;
      // source: 'ADS_B' | 'SSR_MODE_C' | 'SSR_MODE_S' | 'MLAT' | 'ADS_C'
      const validSources = ['ADS_B', 'SSR_MODE_C', 'SSR_MODE_S', 'MLAT', 'ADS_C'];
      if (!validSources.includes(source))
        return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Invalid source type'));

      const inserted = [];
      for (const r of reports) {
        // Resolve flight ID from callsign or squawk
        const flight = await queryOne(`
          SELECT id FROM flights WHERE callsign=$1 AND status IN ('ACTIVE','AIRBORNE')
          LIMIT 1`, [r.callsign]);

        const report = await queryOne(`
          INSERT INTO surveillance_reports (
            flight_id, callsign, source, position_lat, position_lon,
            altitude, ground_speed, track_angle, vertical_rate,
            squawk, adsb_icao, signal_quality, timestamp
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
          RETURNING *`, [
          flight?.id || null, r.callsign, source,
          r.lat, r.lon, r.altitude,
          r.ground_speed, r.track, r.vertical_rate,
          r.squawk, r.icao24, r.signal_quality || 1.0
        ]);

        inserted.push(report);
        broadcastPosition(report);
      }

      res.status(201).json(createSuccessResponse({ inserted: inserted.length }, 'Positions ingested'));
    } catch (e) {
      logger.error('Position ingest error', { error: e.message });
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── CURRENT PICTURE ─────────────────────────────────────────────────────────
app.get('/api/surveillance/picture',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'ATC_TRAINEE', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { sector, min_alt = 0, max_alt = 60000 } = req.query;
      let q = `
        SELECT DISTINCT ON (sr.callsign)
               sr.*, f.aircraft_type, f.operator_icao, f.cruise_altitude,
               f.sector_id, f.status as flight_status
        FROM surveillance_reports sr
        LEFT JOIN flights f ON sr.flight_id=f.id
        WHERE sr.timestamp > NOW()-INTERVAL '2 minutes'
          AND sr.altitude BETWEEN $1 AND $2`;
      const params = [min_alt, max_alt];
      if (sector) { params.push(sector); q += ` AND f.sector_id=$${params.length}`; }
      q += ' ORDER BY sr.callsign, sr.timestamp DESC';

      const picture = await queryAll(q, params);
      res.json(createSuccessResponse({ count: picture.length, tracks: picture }));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── FLIGHT HISTORY ───────────────────────────────────────────────────────────
app.get('/api/surveillance/flights/:callsign/track',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'ATC_TRAINEE', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { callsign } = req.params;
      const { minutes = 60 } = req.query;
      const track = await queryAll(`
        SELECT position_lat, position_lon, altitude, ground_speed, track_angle,
               vertical_rate, source, timestamp
        FROM surveillance_reports
        WHERE callsign=$1 AND timestamp > NOW()-MAKE_INTERVAL(mins=>$2::int)
        ORDER BY timestamp ASC`, [callsign, minutes]);
      res.json(createSuccessResponse({ callsign, points: track.length, track }));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── SQUAWK DETECTION ─────────────────────────────────────────────────────────
app.get('/api/surveillance/squawks/emergency',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SAFETY_OFFICER', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const emergencySquawks = ['7500', '7600', '7700'];
      const aircraft = await queryAll(`
        SELECT DISTINCT ON (callsign) callsign, squawk, altitude, position_lat, position_lon, timestamp
        FROM surveillance_reports
        WHERE squawk = ANY($1) AND timestamp > NOW()-INTERVAL '5 minutes'
        ORDER BY callsign, timestamp DESC`, [emergencySquawks]);

      const codes = { '7500': 'HIJACK', '7600': 'COMMS_FAILURE', '7700': 'EMERGENCY' };
      const result = aircraft.map(a => ({ ...a, emergencyType: codes[a.squawk] }));
      res.json(createSuccessResponse({ count: result.length, emergencies: result }));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.SURVEILLANCE_PORT || 3003;
server.listen(PORT, () => logger.info(`Surveillance service running on port ${PORT}`));

export default app;
