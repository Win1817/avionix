// data-ingest-service/src/index.js
// AVIONIX Data Ingest Service
// Receives raw ADS-B/ASTERIX/FIXM feeds → normalizes → publishes to Kafka → stores to DB

import express from 'express';
import dotenv from 'dotenv';
import { Kafka, Partitioners } from 'kafkajs';
import { createLogger, createSuccessResponse, createErrorResponse } from '../../shared/utils/helpers.js';
import { authenticate, authorize, requestLogger, errorHandler, notFound } from '../../shared/middleware/keycloak-auth.js';
import { query, queryOne, healthCheck } from '../../shared/db/connection.js';
import { ADSBParser } from './parsers/adsb-parser.js';
import { ASTERIXParser } from './parsers/asterix-parser.js';
import { FIXMParser } from './parsers/fixm-parser.js';

dotenv.config();
const app = express();
const logger = createLogger('DATA-INGEST');

// ─── KAFKA SETUP ──────────────────────────────────────────────────────────────
const kafka = new Kafka({
  clientId: 'avionix-data-ingest',
  brokers: (process.env.KAFKA_BROKERS || 'kafka:9092').split(','),
  retry: { initialRetryTime: 3000, retries: 10 }
});

const producer = kafka.producer({
  createPartitioner: Partitioners.LegacyPartitioner,
  allowAutoTopicCreation: true,
});

const TOPICS = {
  POSITION_UPDATES:  'avionix.surveillance.positions',
  FLIGHT_PLAN_FILED: 'avionix.flights.filed',
  FLIGHT_ACTIVATED:  'avionix.flights.activated',
  WEATHER_REPORT:    'avionix.weather.reports',
  SYSTEM_EVENTS:     'avionix.system.events',
};

const publish = async (topic, key, value) => {
  try {
    await producer.send({
      topic,
      messages: [{ key, value: JSON.stringify(value), timestamp: Date.now().toString() }],
    });
  } catch (e) {
    logger.error('Kafka publish failed', { topic, error: e.message });
    // Fallback: write directly to DB if Kafka unavailable
  }
};

// Parsers
const adsbParser   = new ADSBParser();
const asterixParser = new ASTERIXParser();
const fixmParser   = new FIXMParser();

// Ingestion stats
const stats = { adsb: 0, asterix: 0, fixm: 0, errors: 0, lastUpdate: null };

app.use(express.json({ limit: '10mb' }));
app.use(requestLogger);

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/health', async (req, res) => {
  try {
    const db = await healthCheck();
    res.json({ status: 'healthy', service: 'data-ingest', db, stats, topics: TOPICS });
  } catch (e) {
    res.status(503).json({ status: 'unhealthy', error: e.message });
  }
});

// ─── ADS-B INGEST (JSON format from dump1090/VRS) ─────────────────────────────
app.post('/ingest/adsb', authenticate, authorize('SUPER_ADMIN', 'SYSTEM_MONITOR'), async (req, res) => {
  try {
    const { aircraft = [], messages = [] } = req.body;
    const items = aircraft.length ? aircraft : messages;
    const normalized = [];

    for (const item of items) {
      const position = adsbParser.parse(item);
      if (!position) continue;
      normalized.push(position);

      // Publish to Kafka
      await publish(TOPICS.POSITION_UPDATES, position.callsign || position.icao24, {
        source: 'ADS_B', ...position, ingestedAt: new Date().toISOString()
      });

      // Write to DB via surveillance endpoint
      await query(`
        INSERT INTO surveillance_reports
          (callsign, source, position_lat, position_lon, altitude, ground_speed, track_angle,
           vertical_rate, squawk, adsb_icao, signal_quality, timestamp)
        VALUES ($1,'ADS_B',$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())`,
        [position.callsign, position.lat, position.lon, position.altitude,
         position.groundSpeed, position.track, position.verticalRate,
         position.squawk, position.icao24, position.rssi || 1.0]);

      stats.adsb++;
    }

    stats.lastUpdate = new Date().toISOString();
    logger.info(`ADS-B ingested ${normalized.length} positions`);
    res.json(createSuccessResponse({ ingested: normalized.length }));
  } catch (e) {
    stats.errors++;
    logger.error('ADS-B ingest error', { error: e.message });
    res.status(500).json(createErrorResponse('INGEST_ERROR', e.message));
  }
});

// ─── ASTERIX CAT021/048 INGEST (binary radar data, base64 encoded) ────────────
app.post('/ingest/asterix', authenticate, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const { data, category = 21 } = req.body; // base64 encoded ASTERIX binary
    if (!data) return res.status(400).json(createErrorResponse('MISSING_DATA', 'ASTERIX data required'));

    const buffer = Buffer.from(data, 'base64');
    const records = asterixParser.parse(buffer, category);

    for (const r of records) {
      await publish(TOPICS.POSITION_UPDATES, r.callsign || r.target_address, {
        source: `SSR_MODE_S`, ...r, ingestedAt: new Date().toISOString()
      });

      await query(`
        INSERT INTO surveillance_reports
          (callsign, source, position_lat, position_lon, altitude, ground_speed,
           track_angle, squawk, adsb_icao, timestamp)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())`,
        [r.callsign, 'SSR_MODE_S', r.lat, r.lon, r.altitude,
         r.groundSpeed, r.track, r.squawk, r.target_address]);

      stats.asterix++;
    }

    stats.lastUpdate = new Date().toISOString();
    res.json(createSuccessResponse({ records: records.length }));
  } catch (e) {
    stats.errors++;
    res.status(500).json(createErrorResponse('INGEST_ERROR', e.message));
  }
});

// ─── FIXM FLIGHT PLAN INGEST (ICAO FIXM 4.3 XML/JSON) ───────────────────────
app.post('/ingest/fixm', authenticate, authorize('SUPER_ADMIN', 'ATC_SUPERVISOR'), async (req, res) => {
  try {
    const { flightPlan, format = 'json' } = req.body;
    const normalized = fixmParser.parse(flightPlan, format);

    // Check for duplicate
    const existing = await queryOne(
      'SELECT id FROM flights WHERE callsign=$1 AND departure_time::date=CURRENT_DATE', [normalized.callsign]
    );
    if (existing) {
      logger.warn(`Duplicate FIXM flight plan: ${normalized.callsign}`);
      return res.status(409).json(createErrorResponse('DUPLICATE', `Flight plan ${normalized.callsign} already exists today`));
    }

    // Insert flight
    const flight = await queryOne(`
      INSERT INTO flights (callsign, aircraft_type, aircraft_registration,
        departure_airport, destination_airport, departure_time,
        cruise_altitude, cruise_speed, status, flight_rules, operator_icao)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'FILED',$9,$10) RETURNING *`,
      [normalized.callsign, normalized.aircraftType, normalized.registration,
       normalized.depAirport, normalized.destAirport, normalized.depTime,
       normalized.cruiseAlt, normalized.cruiseSpeed, normalized.flightRules,
       normalized.operator]);

    await publish(TOPICS.FLIGHT_PLAN_FILED, flight.callsign, {
      ...flight, ingestedAt: new Date().toISOString()
    });

    stats.fixm++;
    stats.lastUpdate = new Date().toISOString();
    logger.info(`FIXM flight plan ingested: ${flight.callsign}`);
    res.status(201).json(createSuccessResponse(flight, 'Flight plan ingested'));
  } catch (e) {
    stats.errors++;
    res.status(500).json(createErrorResponse('INGEST_ERROR', e.message));
  }
});

// ─── BULK POSITION UPDATE (from aggregators like Flightradar/OpsPort) ─────────
app.post('/ingest/bulk-positions', authenticate, authorize('SUPER_ADMIN'), async (req, res) => {
  try {
    const { positions = [], source = 'ADS_B' } = req.body;
    let count = 0;

    // Batch insert for performance
    for (let i = 0; i < positions.length; i += 50) {
      const batch = positions.slice(i, i + 50);
      await Promise.all(batch.map(async (p) => {
        await publish(TOPICS.POSITION_UPDATES, p.callsign, { source, ...p });
        await query(`
          INSERT INTO surveillance_reports
            (callsign, source, position_lat, position_lon, altitude, ground_speed, track_angle, timestamp)
          VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
          [p.callsign, source, p.lat, p.lon, p.altitude, p.speed, p.heading]);
        count++;
      }));
    }

    stats.adsb += count;
    stats.lastUpdate = new Date().toISOString();
    res.json(createSuccessResponse({ ingested: count }));
  } catch (e) {
    stats.errors++;
    res.status(500).json(createErrorResponse('INGEST_ERROR', e.message));
  }
});

// ─── STATS ────────────────────────────────────────────────────────────────────
app.get('/stats', authenticate, authorize('SUPER_ADMIN', 'SYSTEM_MONITOR'), (req, res) => {
  res.json(createSuccessResponse({ ...stats, topics: TOPICS }));
});

app.use(notFound);
app.use(errorHandler);

// ─── STARTUP ──────────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await producer.connect();
    logger.info('Kafka producer connected');
  } catch (e) {
    logger.warn('Kafka unavailable — running in DB-only mode', { error: e.message });
  }

  const PORT = process.env.INGEST_PORT || 3008;
  app.listen(PORT, () => logger.info(`Data Ingest Service running on port ${PORT}`));
};

start();

export default app;
