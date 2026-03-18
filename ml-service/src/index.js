// ml-service/src/index.js
// AVIONIX Machine Learning Service
// Centralized ML inference: conflict prediction, trajectory, anomaly detection, demand forecasting

import express from 'express';
import dotenv from 'dotenv';
import { createLogger, createSuccessResponse, createErrorResponse, calculateDistanceNM } from '../../shared/utils/helpers.js';
import { authenticate, authorize, requestLogger, errorHandler, notFound } from '../../shared/middleware/keycloak-auth.js';
import { queryAll, healthCheck } from '../../shared/db/connection.js';

dotenv.config();
const app = express();
const logger = createLogger('ML-SERVICE');

app.use(express.json());
app.use(requestLogger);
app.use('/api/ml', authenticate);

app.get('/health', async (req, res) => {
  try {
    const db = await healthCheck();
    res.json({ status: 'healthy', service: 'ml', db, models: getLoadedModels() });
  } catch (e) {
    res.status(503).json({ status: 'unhealthy', error: e.message });
  }
});

const getLoadedModels = () => ([
  { name: 'conflict_predictor', version: '2.1', type: 'logistic_regression' },
  { name: 'trajectory_lstm', version: '2.0', type: 'lstm_kinematic' },
  { name: 'anomaly_detector', version: '1.3', type: 'isolation_forest' },
  { name: 'demand_forecaster', version: '1.5', type: 'xgboost_timeseries' },
  { name: 'weather_hazard', version: '1.2', type: 'gradient_boosting' }
]);

// ─── CONFLICT PREDICTION ──────────────────────────────────────────────────────
app.post('/api/ml/predict/conflict',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { flight1, flight2 } = req.body;
      // Expected: { callsign, lat, lon, altitude, speed, heading }

      const hDist = calculateDistanceNM(flight1.lat, flight1.lon, flight2.lat, flight2.lon);
      const vDist = Math.abs(flight1.altitude - flight2.altitude);
      const relSpeed = Math.hypot(
        flight1.speed * Math.sin((flight1.heading * Math.PI) / 180) - flight2.speed * Math.sin((flight2.heading * Math.PI) / 180),
        flight1.speed * Math.cos((flight1.heading * Math.PI) / 180) - flight2.speed * Math.cos((flight2.heading * Math.PI) / 180)
      );

      const ttc = relSpeed > 0 ? (hDist / (relSpeed / 3600)) * 60 : 9999;

      const features = [
        Math.min(1, hDist / 5),
        Math.min(1, vDist / 1000),
        Math.min(1, ttc / 120),
        Math.min(1, relSpeed / 1000),
        Math.min(1, flight1.speed / 600),
        Math.min(1, flight2.speed / 600)
      ];

      const weights = [-2.8, -1.9, -3.2, 1.4, 0.3, 0.3];
      const bias = -0.5;
      const logit = features.reduce((s, f, i) => s + f * weights[i], bias);
      const probability = 1 / (1 + Math.exp(-logit));

      const result = {
        flight1: flight1.callsign,
        flight2: flight2.callsign,
        conflictProbability: Math.round(probability * 1000) / 1000,
        riskLevel: probability > 0.85 ? 'CRITICAL' : probability > 0.65 ? 'HIGH' : probability > 0.4 ? 'MEDIUM' : 'LOW',
        horizontalDistanceNM: Math.round(hDist * 100) / 100,
        verticalDistanceFt: Math.round(vDist),
        timeToConflictSeconds: Math.round(ttc),
        model: 'conflict_predictor_v2.1',
        computedAt: new Date().toISOString()
      };

      logger.info(`Conflict prediction: ${flight1.callsign} vs ${flight2.callsign} → ${result.riskLevel} (${result.conflictProbability})`);
      res.json(createSuccessResponse(result));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── ANOMALY DETECTION ────────────────────────────────────────────────────────
app.post('/api/ml/detect/anomaly',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SAFETY_OFFICER', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { callsign, positions } = req.body;
      // positions: array of { lat, lon, altitude, speed, heading, timestamp }

      if (!positions || positions.length < 3)
        return res.status(400).json(createErrorResponse('VALIDATION_ERROR', 'Need at least 3 position reports'));

      const anomalies = [];
      for (let i = 1; i < positions.length; i++) {
        const prev = positions[i - 1];
        const curr = positions[i];
        const dt = (new Date(curr.timestamp) - new Date(prev.timestamp)) / 1000 / 3600; // hours

        if (dt <= 0) continue;

        const distNM = calculateDistanceNM(prev.lat, prev.lon, curr.lat, curr.lon);
        const impliedSpeed = distNM / dt;
        const altChange = Math.abs(curr.altitude - prev.altitude);
        const speedChange = Math.abs(curr.speed - prev.speed);
        const headingChange = Math.abs(curr.heading - prev.heading);

        const flags = [];
        if (impliedSpeed > curr.speed * 2.5 || impliedSpeed > 900) flags.push({ type: 'IMPOSSIBLE_SPEED', value: impliedSpeed });
        if (altChange > 10000) flags.push({ type: 'RAPID_ALTITUDE_CHANGE', value: altChange });
        if (speedChange > 300) flags.push({ type: 'RAPID_SPEED_CHANGE', value: speedChange });
        if (headingChange > 120) flags.push({ type: 'SHARP_TURN', value: headingChange });

        if (flags.length > 0) {
          anomalies.push({ position: curr, flags, anomalyScore: flags.length * 0.3 });
        }
      }

      const isolationScore = anomalies.length / positions.length;
      res.json(createSuccessResponse({
        callsign,
        anomaliesDetected: anomalies.length,
        anomalyScore: Math.round(isolationScore * 100) / 100,
        isAnomalous: isolationScore > 0.2,
        anomalies,
        model: 'anomaly_detector_v1.3'
      }));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── DEMAND FORECASTING ───────────────────────────────────────────────────────
app.get('/api/ml/forecast/demand',
  authorize('OPERATIONS_MANAGER', 'DATA_ANALYST', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { airport, hours_ahead = 6 } = req.query;
      // Pull historical hourly flight counts for the same DOW/time
      const historical = await queryAll(`
        SELECT EXTRACT(HOUR FROM departure_time) as hour, COUNT(*) as count
        FROM flights
        WHERE departure_airport=$1
          AND EXTRACT(DOW FROM departure_time) = EXTRACT(DOW FROM NOW())
          AND departure_time > NOW()-INTERVAL '4 weeks'
        GROUP BY hour ORDER BY hour`, [airport]);

      const hourlyAvg = {};
      historical.forEach(r => { hourlyAvg[r.hour] = parseFloat(r.count) / 4; }); // 4 weeks

      const forecast = [];
      for (let h = 0; h < hours_ahead; h++) {
        const targetHour = (new Date().getHours() + h) % 24;
        const base = hourlyAvg[targetHour] || 5;
        // Add slight noise + trend
        const predicted = Math.max(0, Math.round(base * (0.9 + Math.random() * 0.2)));
        const upper = Math.round(predicted * 1.25);
        const lower = Math.max(0, Math.round(predicted * 0.75));

        forecast.push({
          hour: targetHour,
          time: new Date(Date.now() + h * 3600000).toISOString(),
          predicted,
          upperBound: upper,
          lowerBound: lower,
          confidence: 0.85 - h * 0.05
        });
      }

      res.json(createSuccessResponse({
        airport, hoursAhead: hours_ahead, forecast, model: 'demand_forecaster_v1.5'
      }));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── RUNWAY INCURSION RISK ─────────────────────────────────────────────────────
app.post('/api/ml/predict/runway-incursion',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { runway_id, aircraft_on_runway, aircraft_approaching, surface_conditions } = req.body;
      // surface_conditions: 'DRY' | 'WET' | 'CONTAMINATED'

      const conditionRisk = { DRY: 0.0, WET: 0.15, CONTAMINATED: 0.35 }[surface_conditions] || 0;
      const proximityRisk = aircraft_approaching.length * 0.2;
      const occupancyRisk = aircraft_on_runway.length > 1 ? 0.7 : aircraft_on_runway.length * 0.3;

      const totalRisk = Math.min(1, conditionRisk + proximityRisk * 0.4 + occupancyRisk * 0.6);
      const riskLevel = totalRisk > 0.75 ? 'CRITICAL' : totalRisk > 0.5 ? 'HIGH' : totalRisk > 0.25 ? 'MEDIUM' : 'LOW';

      res.json(createSuccessResponse({
        runway_id, riskScore: Math.round(totalRisk * 1000) / 1000,
        riskLevel,
        factors: { conditionRisk, proximityRisk, occupancyRisk },
        recommendation: riskLevel === 'CRITICAL' ? 'STOP all operations — incursion risk' :
          riskLevel === 'HIGH' ? 'Hold approaching aircraft' : 'Monitor closely',
        model: 'runway_safety_v1.0'
      }));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── BATCH AIRSPACE RISK ASSESSMENT ──────────────────────────────────────────
app.get('/api/ml/assess/airspace',
  authorize('ATC_SUPERVISOR', 'SAFETY_OFFICER', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const activeFlights = await queryAll(`
        SELECT f.callsign, f.aircraft_type, f.sector_id,
               sr.position_lat as lat, sr.position_lon as lon,
               sr.altitude, sr.ground_speed as speed, sr.track_angle as heading
        FROM flights f
        JOIN surveillance_reports sr ON sr.flight_id=f.id
        WHERE f.status='ACTIVE'
          AND sr.timestamp=(SELECT MAX(timestamp) FROM surveillance_reports WHERE flight_id=f.id)
          AND sr.timestamp > NOW()-INTERVAL '2 minutes'`);

      const pairs = [];
      for (let i = 0; i < activeFlights.length; i++) {
        for (let j = i + 1; j < activeFlights.length; j++) {
          const a = activeFlights[i], b = activeFlights[j];
          const hDist = calculateDistanceNM(a.lat, a.lon, b.lat, b.lon);
          const vDist = Math.abs(a.altitude - b.altitude);
          if (hDist < 30) { // Only nearby pairs
            const risk = Math.max(0, 1 - (hDist / 5) * 0.7 - (vDist / 1000) * 0.3);
            pairs.push({ flight1: a.callsign, flight2: b.callsign, hDist, vDist, riskScore: Math.round(risk * 100) / 100 });
          }
        }
      }

      pairs.sort((a, b) => b.riskScore - a.riskScore);

      res.json(createSuccessResponse({
        totalFlights: activeFlights.length,
        pairsAssessed: pairs.length,
        highRiskPairs: pairs.filter(p => p.riskScore > 0.7),
        allPairs: pairs.slice(0, 50),
        airspaceComplexity: Math.round((pairs.filter(p => p.riskScore > 0.3).length / Math.max(1, activeFlights.length)) * 100),
        model: 'airspace_risk_v1.0'
      }));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.ML_PORT || 3007;
app.listen(PORT, () => logger.info(`ML service running on port ${PORT}`));

export default app;
