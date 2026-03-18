// weather-service/src/index.js
// AVIONIX Weather Service
// METAR, TAF, SIGMET, PIREP ingestion + ML hazard prediction

import express from 'express';
import dotenv from 'dotenv';
import { createLogger, createSuccessResponse, createErrorResponse } from '../../shared/utils/helpers.js';
import { authenticate, authorize, requestLogger, errorHandler, notFound } from '../../shared/middleware/keycloak-auth.js';
import { queryOne, queryAll, healthCheck } from '../../shared/db/connection.js';
import { WeatherHazardModel } from './ml/weather-hazard.js';

dotenv.config();
const app = express();
const logger = createLogger('WEATHER');
const hazardModel = new WeatherHazardModel();

app.use(express.json());
app.use(requestLogger);
app.use('/api/weather', authenticate);

app.get('/health', async (req, res) => {
  try {
    const db = await healthCheck();
    res.json({ status: 'healthy', service: 'weather', db });
  } catch (e) {
    res.status(503).json({ status: 'unhealthy', error: e.message });
  }
});

// ─── METAR ────────────────────────────────────────────────────────────────────
app.get('/api/weather/metar/:icao', authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'ATC_TRAINEE', 'PILOT', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const metar = await queryOne(`
      SELECT * FROM metars WHERE station_icao=$1 ORDER BY observation_time DESC LIMIT 1`,
      [req.params.icao.toUpperCase()]);
    if (!metar) return res.status(404).json(createErrorResponse('NOT_FOUND', 'METAR not found'));
    res.json(createSuccessResponse(metar));
  } catch (e) {
    res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
  }
});

app.post('/api/weather/metar', authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const { station_icao, raw_text, wind_dir, wind_speed, wind_gust,
      visibility, ceiling, temperature, dewpoint, altimeter, weather_codes } = req.body;

    const metar = await queryOne(`
      INSERT INTO metars (station_icao, raw_text, wind_direction, wind_speed_kt, wind_gust_kt,
        visibility_sm, ceiling_ft, temperature_c, dewpoint_c, altimeter_inhg,
        weather_codes, observation_time)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW()) RETURNING *`,
      [station_icao, raw_text, wind_dir, wind_speed, wind_gust,
        visibility, ceiling, temperature, dewpoint, altimeter, JSON.stringify(weather_codes || [])]);

    res.status(201).json(createSuccessResponse(metar, 'METAR ingested'));
  } catch (e) {
    res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
  }
});

// ─── TAF ──────────────────────────────────────────────────────────────────────
app.get('/api/weather/taf/:icao', authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'PILOT', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const taf = await queryOne(`
      SELECT * FROM tafs WHERE station_icao=$1
        AND valid_to > NOW() ORDER BY issued_at DESC LIMIT 1`,
      [req.params.icao.toUpperCase()]);
    if (!taf) return res.status(404).json(createErrorResponse('NOT_FOUND', 'Valid TAF not found'));
    res.json(createSuccessResponse(taf));
  } catch (e) {
    res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
  }
});

// ─── SIGMET ───────────────────────────────────────────────────────────────────
app.get('/api/weather/sigmets', authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'ATC_TRAINEE', 'PILOT', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { fir } = req.query;
    let q = 'SELECT * FROM sigmets WHERE valid_to > NOW()';
    const params = [];
    if (fir) { params.push(fir); q += ` AND fir=$${params.length}`; }
    q += ' ORDER BY issued_at DESC';
    const sigmets = await queryAll(q, params);
    res.json(createSuccessResponse(sigmets));
  } catch (e) {
    res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
  }
});

app.post('/api/weather/sigmets', authorize('ATC_SUPERVISOR', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { fir, phenomenon, level_lower, level_upper, area_polygon,
      intensity, movement, valid_from, valid_to, raw_text } = req.body;
    // phenomenon: 'TURB' | 'ICE' | 'TS' | 'VA' | 'RDOACT' | 'TC'

    const sigmet = await queryOne(`
      INSERT INTO sigmets (fir, phenomenon, level_lower, level_upper, area_polygon,
        intensity, movement, valid_from, valid_to, raw_text, issued_at, issued_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),$11) RETURNING *`,
      [fir, phenomenon, level_lower, level_upper, JSON.stringify(area_polygon),
        intensity, movement, valid_from, valid_to, raw_text, req.user.id]);

    res.status(201).json(createSuccessResponse(sigmet, 'SIGMET issued'));
  } catch (e) {
    res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
  }
});

// ─── PIREP ────────────────────────────────────────────────────────────────────
app.post('/api/weather/pireps', authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'PILOT', 'SUPER_ADMIN'), async (req, res) => {
  try {
    const { callsign, lat, lon, altitude, turbulence_intensity,
      icing_intensity, wind_dir, wind_speed, temperature, remarks } = req.body;

    const pirep = await queryOne(`
      INSERT INTO pireps (callsign, position_lat, position_lon, altitude,
        turbulence_intensity, icing_intensity, wind_direction, wind_speed_kt,
        temperature_c, remarks, reported_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING *`,
      [callsign, lat, lon, altitude, turbulence_intensity, icing_intensity,
        wind_dir, wind_speed, temperature, remarks]);

    res.status(201).json(createSuccessResponse(pirep, 'PIREP recorded'));
  } catch (e) {
    res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
  }
});

// ─── ML HAZARD PREDICTION ─────────────────────────────────────────────────────
app.get('/api/weather/hazards/predict',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { lat, lon, altitude, lookahead_minutes = 30 } = req.query;
      const recentPireps = await queryAll(`
        SELECT * FROM pireps WHERE reported_at > NOW()-INTERVAL '2 hours'
          AND ABS(position_lat-$1) < 2 AND ABS(position_lon-$2) < 2`,
        [lat, lon]);
      const activeSigmets = await queryAll(`SELECT * FROM sigmets WHERE valid_to > NOW()`);

      const prediction = hazardModel.predict(
        parseFloat(lat), parseFloat(lon), parseInt(altitude),
        lookahead_minutes, recentPireps, activeSigmets
      );

      res.json(createSuccessResponse(prediction));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.WEATHER_PORT || 3005;
app.listen(PORT, () => logger.info(`Weather service running on port ${PORT}`));

export default app;
