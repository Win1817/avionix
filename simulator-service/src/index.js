// simulator-service/src/index.js
// AVIONIX Simulator Service
// Generates realistic ATC data and feeds it to all platform services.
// Fully independent — runs standalone with no required dependencies except HTTP access to services.

import express from 'express';
import dotenv from 'dotenv';
import { createLogger, createSuccessResponse, createErrorResponse } from '../../shared/utils/helpers.js';
import { FlightGenerator } from './generators/flight-generator.js';
import { PositionGenerator } from './generators/position-generator.js';
import { WeatherGenerator } from './generators/weather-generator.js';
import { AlertScenarioGenerator } from './generators/alert-scenario-generator.js';
import { DataPublisher } from './publishers/data-publisher.js';
import { ScenarioManager } from './scenarios/scenario-manager.js';

dotenv.config();
const app = express();
app.use(express.json());
const logger = createLogger('SIMULATOR');

// ─── CONFIGURATION ────────────────────────────────────────────────────────────
const CONFIG = {
  ingestUrl:        process.env.INGEST_URL        || 'http://data-ingest-service:3008',
  fdpsUrl:          process.env.FDPS_URL           || 'http://fdps-service:3001',
  weatherUrl:       process.env.WEATHER_URL        || 'http://weather-service:3005',
  gatewayUrl:       process.env.GATEWAY_URL        || 'http://api-gateway:4000',
  simToken:         process.env.SIM_TOKEN          || '',           // service account JWT
  positionInterval: parseInt(process.env.POSITION_INTERVAL_MS) || 4000,   // 4s default
  flightCount:      parseInt(process.env.FLIGHT_COUNT)          || 20,     // active flights
  autoStart:        process.env.AUTO_START === 'true',
};

// ─── GENERATORS & PUBLISHER ───────────────────────────────────────────────────
const publisher       = new DataPublisher(CONFIG);
const flightGen       = new FlightGenerator();
const positionGen     = new PositionGenerator();
const weatherGen      = new WeatherGenerator();
const alertScenarioGen = new AlertScenarioGenerator();
const scenarioManager = new ScenarioManager(flightGen, positionGen, weatherGen, alertScenarioGen, publisher, CONFIG);

// ─── STATE ────────────────────────────────────────────────────────────────────
let running = false;
let intervals = [];
const stats = {
  positionsSent: 0, flightsFiled: 0, weatherReports: 0,
  alertsTriggered: 0, errors: 0, startedAt: null, scenario: 'freeplay'
};

// ─── CONTROL ENDPOINTS ────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'healthy', service: 'simulator',
  running, stats, config: { ...CONFIG, simToken: '***' }
}));

app.post('/sim/start', async (req, res) => {
  if (running) return res.status(409).json(createErrorResponse('ALREADY_RUNNING', 'Simulator is already running'));
  const { scenario = 'freeplay', flightCount, positionInterval } = req.body;

  if (flightCount)      CONFIG.flightCount = parseInt(flightCount);
  if (positionInterval) CONFIG.positionInterval = parseInt(positionInterval);

  await startSimulator(scenario);
  res.json(createSuccessResponse({ scenario, flightCount: CONFIG.flightCount }, 'Simulator started'));
});

app.post('/sim/stop', (req, res) => {
  stopSimulator();
  res.json(createSuccessResponse({ stats }, 'Simulator stopped'));
});

app.post('/sim/reset', async (req, res) => {
  stopSimulator();
  Object.assign(stats, { positionsSent: 0, flightsFiled: 0, weatherReports: 0, alertsTriggered: 0, errors: 0 });
  scenarioManager.reset();
  res.json(createSuccessResponse({}, 'Simulator reset'));
});

app.get('/sim/status', (req, res) => {
  res.json(createSuccessResponse({
    running, stats,
    activeFlights: scenarioManager.getActiveFlights().map(f => ({
      callsign: f.callsign, lat: f.lat, lon: f.lon,
      altitude: f.altitude, speed: f.speed, status: f.status
    }))
  }));
});

app.get('/sim/flights', (req, res) => {
  res.json(createSuccessResponse(scenarioManager.getActiveFlights()));
});

app.post('/sim/scenario', async (req, res) => {
  const { name } = req.body;
  const available = ['freeplay', 'conflict', 'emergency', 'weather_event', 'rush_hour', 'night_ops'];
  if (!available.includes(name))
    return res.status(400).json(createErrorResponse('INVALID_SCENARIO', `Available: ${available.join(', ')}`));

  stopSimulator();
  await startSimulator(name);
  res.json(createSuccessResponse({ scenario: name }, `Scenario "${name}" started`));
});

// Manually inject a specific event
app.post('/sim/inject', async (req, res) => {
  const { type, data } = req.body;
  try {
    switch (type) {
      case 'emergency_squawk':
        await scenarioManager.injectEmergency(data?.callsign);
        break;
      case 'conflict':
        await scenarioManager.injectConflict(data?.callsign1, data?.callsign2);
        break;
      case 'sigmet':
        await scenarioManager.injectSigmet(data);
        break;
      case 'missed_approach':
        await scenarioManager.injectMissedApproach(data?.callsign);
        break;
      default:
        return res.status(400).json(createErrorResponse('UNKNOWN_EVENT', `Unknown injection type: ${type}`));
    }
    stats.alertsTriggered++;
    res.json(createSuccessResponse({ type }, `Event "${type}" injected`));
  } catch (e) {
    res.status(500).json(createErrorResponse('INJECT_ERROR', e.message));
  }
});

// ─── SIMULATOR LIFECYCLE ──────────────────────────────────────────────────────
const startSimulator = async (scenario) => {
  running = true;
  stats.startedAt = new Date().toISOString();
  stats.scenario = scenario;
  logger.info(`Simulator starting — scenario: ${scenario}, flights: ${CONFIG.flightCount}`);

  // 1. Seed initial flight plans
  await scenarioManager.initScenario(scenario, CONFIG.flightCount);

  // 2. Position update loop (every N seconds)
  intervals.push(setInterval(async () => {
    try {
      const updates = scenarioManager.tick();
      if (updates.length > 0) {
        await publisher.sendPositions(updates);
        stats.positionsSent += updates.length;
      }
    } catch (e) {
      stats.errors++;
      logger.error('Position tick error', { error: e.message });
    }
  }, CONFIG.positionInterval));

  // 3. New flight arrival loop (every 45 seconds)
  intervals.push(setInterval(async () => {
    try {
      const newFlight = await scenarioManager.spawnFlight();
      if (newFlight) {
        stats.flightsFiled++;
        logger.info(`New flight spawned: ${newFlight.callsign}`);
      }
    } catch (e) {
      stats.errors++;
    }
  }, 45000));

  // 4. Weather update loop (every 3 minutes)
  intervals.push(setInterval(async () => {
    try {
      const wx = await scenarioManager.updateWeather();
      if (wx) stats.weatherReports++;
    } catch (e) {
      stats.errors++;
    }
  }, 180000));

  // 5. Scenario-specific event loop (every 30 seconds)
  intervals.push(setInterval(async () => {
    try {
      const event = await scenarioManager.runScenarioEvents();
      if (event) stats.alertsTriggered++;
    } catch (e) {
      stats.errors++;
    }
  }, 30000));

  // Send initial weather immediately
  try {
    await scenarioManager.updateWeather();
    stats.weatherReports++;
  } catch (e) {
    logger.warn('Initial weather push failed', { error: e.message });
  }

  logger.info('Simulator running');
};

const stopSimulator = () => {
  intervals.forEach(clearInterval);
  intervals = [];
  running = false;
  logger.info('Simulator stopped', { stats });
};

// ─── STARTUP ──────────────────────────────────────────────────────────────────
const PORT = process.env.SIM_PORT || 3009;
app.listen(PORT, async () => {
  logger.info(`Simulator service running on port ${PORT}`);
  if (CONFIG.autoStart) {
    logger.info('AUTO_START=true — starting freeplay scenario in 10s...');
    setTimeout(() => startSimulator('freeplay'), 10000);
  }
});

// Graceful shutdown
process.on('SIGTERM', () => { stopSimulator(); process.exit(0); });
process.on('SIGINT',  () => { stopSimulator(); process.exit(0); });

export default app;
