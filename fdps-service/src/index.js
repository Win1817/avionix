// fdps-service/src/index.js
// AVIONIX Flight Data Processing Service (FDPS)
// Handles flight plans, 4D trajectories, and conflict detection

import express from 'express';
import dotenv from 'dotenv';
import { createLogger, createSuccessResponse, createErrorResponse,
  calculateDistanceNM, FLIGHT_STATUS, DEFAULT_SEPARATION_MINIMA,
  TIME_CONSTANTS, isValidCallsign, isValidAirportCode, isValidAltitude
} from '../../shared/utils/helpers.js';
import { authenticate, authorize, requestLogger, errorHandler, notFound, rateLimit } from '../../shared/middleware/keycloak-auth.js';
import { query, queryOne, queryAll, transaction, healthCheck } from '../../shared/db/connection.js';
import { MLTrajectoryPredictor } from './ml/trajectory-predictor.js';

dotenv.config();
const app = express();
const logger = createLogger('FDPS');
const mlPredictor = new MLTrajectoryPredictor();

app.use(express.json());
app.use(requestLogger);
app.use(rateLimit(200, 60000));
app.use('/api/fdps', authenticate);

// ─── HEALTH ──────────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const db = await healthCheck();
    res.json({ status: 'healthy', service: 'fdps', db, ts: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'unhealthy', error: e.message });
  }
});

// ─── FLIGHT PLANS ────────────────────────────────────────────────────────────
app.post('/api/fdps/flights',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { callsign, aircraft_type, aircraft_registration, departure_airport,
        destination_airport, departure_time, cruise_altitude, cruise_speed,
        flight_rules, operator_icao, route, waypoints, fuel_weight,
        passenger_count, special_handling } = req.body;

      if (!isValidCallsign(callsign))
        return res.status(400).json(createErrorResponse('VALIDATION_ERROR', `Invalid callsign: ${callsign}`));
      if (!isValidAirportCode(departure_airport) || !isValidAirportCode(destination_airport))
        return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Invalid airport ICAO code'));
      if (!isValidAltitude(cruise_altitude))
        return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Invalid cruise altitude'));

      const flight = await transaction(async (client) => {
        const r = await client.query(`
          INSERT INTO flights (callsign, aircraft_type, aircraft_registration,
            departure_airport, destination_airport, departure_time,
            cruise_altitude, cruise_speed, status, flight_rules, operator_icao)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
          [callsign, aircraft_type, aircraft_registration, departure_airport,
            destination_airport, new Date(departure_time), cruise_altitude,
            cruise_speed, FLIGHT_STATUS.FILED, flight_rules, operator_icao]);
        const flightId = r.rows[0].id;
        await client.query(`
          INSERT INTO flight_plans_extended (flight_id, route, waypoints, fuel_weight, passenger_count, special_handling)
          VALUES ($1,$2,$3,$4,$5,$6)`,
          [flightId, route, JSON.stringify(waypoints || []), fuel_weight, passenger_count, special_handling]);
        return r.rows[0];
      });

      logger.info(`Flight plan filed: ${callsign}`, { flightId: flight.id, user: req.user.username });
      res.status(201).json(createSuccessResponse(flight, 'Flight plan filed'));
    } catch (e) {
      logger.error('Error creating flight plan', { error: e.message });
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

app.get('/api/fdps/flights', authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'ATC_TRAINEE', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { status = FLIGHT_STATUS.ACTIVE, sector, limit = 100, offset = 0 } = req.query;
    const params = [status, limit, offset];
    let sectorClause = '';
    if (sector) { sectorClause = ' AND f.sector_id = $4'; params.push(sector); }

    const flights = await queryAll(`
      SELECT f.*, fpe.route, fpe.waypoints, fpe.coordination_status,
             COUNT(sa.id) FILTER (WHERE sa.is_active) as active_alerts
      FROM flights f
      LEFT JOIN flight_plans_extended fpe ON f.id = fpe.flight_id
      LEFT JOIN safety_alerts sa ON f.id = sa.flight_id_primary OR f.id = sa.flight_id_secondary
      WHERE f.status = $1${sectorClause}
      GROUP BY f.id, fpe.id
      ORDER BY f.departure_time DESC
      LIMIT $2 OFFSET $3`, params);

    res.json(createSuccessResponse(flights));
  } catch (e) {
    res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
  }
});

app.get('/api/fdps/flights/:flightId', authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'ATC_TRAINEE', 'PILOT', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const flight = await queryOne(`
      SELECT f.*, fpe.route, fpe.waypoints, fpe.coordination_status,
             COUNT(sa.id) FILTER (WHERE sa.is_active) as active_alerts
      FROM flights f
      LEFT JOIN flight_plans_extended fpe ON f.id = fpe.flight_id
      LEFT JOIN safety_alerts sa ON f.id = sa.flight_id_primary OR f.id = sa.flight_id_secondary
      WHERE f.id = $1 GROUP BY f.id, fpe.id`, [req.params.flightId]);
    if (!flight) return res.status(404).json(createErrorResponse('NOT_FOUND', 'Flight not found'));
    res.json(createSuccessResponse(flight));
  } catch (e) {
    res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
  }
});

app.put('/api/fdps/flights/:flightId',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { cruise_altitude, cruise_speed, destination_airport, special_handling, status } = req.body;
      const flight = await transaction(async (client) => {
        const r = await client.query(`
          UPDATE flights SET
            cruise_altitude = COALESCE($1, cruise_altitude),
            cruise_speed = COALESCE($2, cruise_speed),
            destination_airport = COALESCE($3, destination_airport),
            status = COALESCE($4, status),
            updated_at = CURRENT_TIMESTAMP
          WHERE id = $5 RETURNING *`,
          [cruise_altitude, cruise_speed, destination_airport, status, req.params.flightId]);
        if (!r.rows[0]) throw new Error('Flight not found');
        if (special_handling)
          await client.query('UPDATE flight_plans_extended SET special_handling=$1 WHERE flight_id=$2',
            [special_handling, req.params.flightId]);
        return r.rows[0];
      });
      logger.info(`Flight updated: ${flight.callsign}`, { user: req.user.username });
      res.json(createSuccessResponse(flight, 'Flight updated'));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── 4D TRAJECTORY (ML-ENHANCED) ─────────────────────────────────────────────
app.post('/api/fdps/trajectories/:flightId',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { flightId } = req.params;
      const { prediction_horizon = TIME_CONSTANTS.TRAJECTORY_HORIZON_MINUTES, use_ml = true } = req.body;

      const flight = await queryOne('SELECT * FROM flights WHERE id = $1', [flightId]);
      if (!flight) return res.status(404).json(createErrorResponse('NOT_FOUND', 'Flight not found'));

      const currentPos = await queryOne(`
        SELECT * FROM surveillance_reports WHERE flight_id=$1 ORDER BY timestamp DESC LIMIT 1`, [flightId]);

      let trajectoryPoints, confidence;
      if (use_ml && currentPos) {
        const mlResult = await mlPredictor.predict(flight, currentPos, prediction_horizon);
        trajectoryPoints = mlResult.points;
        confidence = mlResult.confidence;
      } else {
        trajectoryPoints = calculateBasicTrajectory(flight, currentPos, prediction_horizon);
        confidence = 0.75;
      }

      await query(`UPDATE trajectories_4d SET is_current=FALSE WHERE flight_id=$1`, [flightId]);
      const trajectory = await queryOne(`
        INSERT INTO trajectories_4d (flight_id, calculated_at, prediction_horizon_minutes,
          trajectory_points, wind_adjusted, confidence_level, is_current, ml_model_used)
        VALUES ($1, CURRENT_TIMESTAMP, $2, $3, TRUE, $4, TRUE, $5) RETURNING *`,
        [flightId, prediction_horizon, JSON.stringify(trajectoryPoints), confidence, use_ml ? 'lstm_v2' : 'kinematic']);

      res.status(201).json(createSuccessResponse(trajectory, '4D trajectory calculated'));
    } catch (e) {
      logger.error('Trajectory error', { error: e.message });
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

app.get('/api/fdps/trajectories/:flightId', authenticate, async (req, res) => {
  try {
    const t = await queryOne(`
      SELECT * FROM trajectories_4d WHERE flight_id=$1 AND is_current=TRUE
      ORDER BY calculated_at DESC LIMIT 1`, [req.params.flightId]);
    if (!t) return res.status(404).json(createErrorResponse('NOT_FOUND', 'No trajectory found'));
    res.json(createSuccessResponse(t));
  } catch (e) {
    res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
  }
});

// ─── CONFLICT DETECTION ───────────────────────────────────────────────────────
app.post('/api/fdps/check-conflicts',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { flightId1, flightId2 } = req.body;
      const [f1, f2] = await Promise.all([
        queryOne(`SELECT f.*, sr.position_lat, sr.position_lon, sr.altitude, sr.ground_speed
          FROM flights f LEFT JOIN surveillance_reports sr ON f.id=sr.flight_id
          AND sr.timestamp=(SELECT MAX(timestamp) FROM surveillance_reports WHERE flight_id=f.id)
          WHERE f.id=$1`, [flightId1]),
        queryOne(`SELECT f.*, sr.position_lat, sr.position_lon, sr.altitude, sr.ground_speed
          FROM flights f LEFT JOIN surveillance_reports sr ON f.id=sr.flight_id
          AND sr.timestamp=(SELECT MAX(timestamp) FROM surveillance_reports WHERE flight_id=f.id)
          WHERE f.id=$1`, [flightId2])
      ]);
      if (!f1 || !f2) return res.status(404).json(createErrorResponse('NOT_FOUND', 'Flight(s) not found'));

      const hSep = calculateDistanceNM(f1.position_lat, f1.position_lon, f2.position_lat, f2.position_lon);
      const vSep = Math.abs(f1.altitude - f2.altitude);
      const m = DEFAULT_SEPARATION_MINIMA;

      res.json(createSuccessResponse({
        flight1: f1.callsign, flight2: f2.callsign,
        horizontalSeparation: hSep, verticalSeparation: vSep,
        requiredHorizontal: m.HORIZONTAL_ENROUTE, requiredVertical: m.VERTICAL_ENROUTE,
        hasConflict: hSep < m.HORIZONTAL_ENROUTE && vSep < m.VERTICAL_ENROUTE
      }));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── SECTOR ASSIGNMENT ────────────────────────────────────────────────────────
app.post('/api/fdps/flights/:flightId/assign-sector',
  authorize('ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { sector_id, controller_id } = req.body;
      const flight = await queryOne(`
        UPDATE flights SET sector_id=$1, assigned_controller_id=$2, updated_at=NOW()
        WHERE id=$3 RETURNING *`, [sector_id, controller_id, req.params.flightId]);
      if (!flight) return res.status(404).json(createErrorResponse('NOT_FOUND', 'Flight not found'));
      res.json(createSuccessResponse(flight, 'Sector assigned'));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── HELPERS ──────────────────────────────────────────────────────────────────
const calculateBasicTrajectory = (flight, currentPos, horizonMinutes) => {
  const points = [];
  for (let i = 0; i <= horizonMinutes; i++) {
    const progress = i / horizonMinutes;
    points.push({
      time: new Date(Date.now() + i * 60000).toISOString(),
      lat: (currentPos?.position_lat || 0) + progress * 0.05,
      lon: (currentPos?.position_lon || 0) + progress * 0.05,
      altitude: (currentPos?.altitude || 0) + progress * (flight.cruise_altitude - (currentPos?.altitude || 0)),
      speed: currentPos?.ground_speed || flight.cruise_speed
    });
  }
  return points;
};

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.FDPS_PORT || 3001;
app.listen(PORT, () => logger.info(`FDPS running on port ${PORT}`));

export default app;
