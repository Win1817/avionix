// simulator-service/src/scenarios/scenario-manager.js
// Orchestrates all generators, manages active flights, runs named scenarios

import { createLogger } from '../../../shared/utils/helpers.js';
const logger = createLogger('SCENARIO-MGR');

const rand = (min, max) => Math.random() * (max - min) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class ScenarioManager {
  constructor(flightGen, positionGen, weatherGen, alertGen, publisher, config) {
    this.flightGen   = flightGen;
    this.positionGen = positionGen;
    this.weatherGen  = weatherGen;
    this.alertGen    = alertGen;
    this.publisher   = publisher;
    this.config      = config;

    this.flights     = new Map(); // callsign → flight object
    this.scenario    = 'freeplay';
    this.tickCount   = 0;
  }

  reset() {
    this.flights.clear();
    this.tickCount = 0;
  }

  getActiveFlights() {
    return Array.from(this.flights.values()).filter(f => f._sim.status !== 'LANDED');
  }

  // ─── SCENARIO INIT ──────────────────────────────────────────────────────────
  async initScenario(scenario, flightCount) {
    this.scenario = scenario;
    logger.info(`Initializing scenario: ${scenario} with ${flightCount} flights`);

    switch (scenario) {
      case 'freeplay':
        await this._seedFlights(flightCount);
        break;

      case 'conflict':
        await this._seedFlights(Math.max(6, flightCount));
        // Force an immediate conflict between first two flights
        await this._forceConflict();
        break;

      case 'emergency':
        await this._seedFlights(Math.max(8, flightCount));
        // Trigger emergency squawk on a random flight
        await this._triggerEmergency();
        break;

      case 'weather_event':
        await this._seedFlights(flightCount);
        // Issue severe SIGMET over active area
        const sigmet = this.weatherGen.generateSigmet(true);
        await this.publisher.sendSigmet(sigmet);
        logger.info(`Severe weather event: ${sigmet.phenomenon}`);
        break;

      case 'rush_hour':
        // Double the flights, shorter intervals
        await this._seedFlights(Math.min(40, flightCount * 2));
        break;

      case 'night_ops':
        // Fewer flights, lower altitudes, some cargo
        await this._seedFlights(Math.max(5, Math.floor(flightCount * 0.4)));
        break;
    }
  }

  // ─── TICK (called every positionInterval ms) ─────────────────────────────────
  tick() {
    this.tickCount++;
    const active = this.getActiveFlights();

    // Remove landed flights after a delay
    this.flights.forEach((f, callsign) => {
      if (f._sim.status === 'LANDED') this.flights.delete(callsign);
    });

    // Advance positions
    const updates = this.positionGen.tick(active, this.config.positionInterval);
    return updates;
  }

  // ─── SPAWN NEW FLIGHT ─────────────────────────────────────────────────────────
  async spawnFlight() {
    const active = this.getActiveFlights();
    if (active.length >= this.config.flightCount * 1.3) return null; // cap at 130%

    const flight = this.flightGen.generateFlightPlan();

    // Assign initial position (near departure airport)
    flight._sim.speed = 0;
    flight._sim.phase = 'CLIMB';

    this.flights.set(flight.callsign, flight);

    // Send flight plan to FDPS
    await this.publisher.sendFlightPlan(flight);

    // Send initial position
    const initPos = [{
      callsign: flight.callsign, icao24: flight._sim.icao24,
      lat: flight._sim.lat, lon: flight._sim.lon,
      altitude: flight._sim.altitude, ground_speed: 0,
      track: flight._sim.heading, vertical_rate: 0,
      squawk: flight._sim.squawk, signal_quality: 0.9, source: 'ADS_B', phase: 'CLIMB',
    }];
    await this.publisher.sendPositions(initPos);

    return flight;
  }

  // ─── WEATHER UPDATE ───────────────────────────────────────────────────────────
  async updateWeather() {
    const metars = this.weatherGen.generateAllMetars();
    await Promise.all(metars.map(m => this.publisher.sendMetar(m)));

    // Occasional PIREP from a cruising flight
    const cruising = this.getActiveFlights().filter(f => f._sim.phase === 'CRUISE');
    if (cruising.length > 0) {
      const f = pick(cruising);
      const pirep = this.weatherGen.generatePirep(f.callsign, f._sim.lat, f._sim.lon, f._sim.altitude);
      if (pirep.turbulence_intensity || pirep.icing_intensity) {
        await this.publisher.sendPirep(pirep);
      }
    }

    return metars;
  }

  // ─── SCENARIO EVENTS (called every 30s) ──────────────────────────────────────
  async runScenarioEvents() {
    const active = this.getActiveFlights();
    if (!active.length) return null;

    switch (this.scenario) {
      case 'conflict':
        // Re-enforce conflict every 2 minutes
        if (this.tickCount % 30 === 0) return this._forceConflict();
        break;

      case 'emergency':
        // Occasional new emergency
        if (this.tickCount % 60 === 0 && Math.random() > 0.7) return this._triggerEmergency();
        break;

      case 'weather_event':
        // Occasional new SIGMET
        if (this.tickCount % 40 === 0) {
          const s = this.weatherGen.generateSigmet(Math.random() > 0.5);
          await this.publisher.sendSigmet(s);
          return { type: 'SIGMET', phenomenon: s.phenomenon };
        }
        break;

      case 'freeplay':
        // Random minor events
        if (Math.random() > 0.85) return this._randomMinorEvent(active);
        break;
    }
    return null;
  }

  // ─── INJECTABLE EVENTS ───────────────────────────────────────────────────────
  async injectConflict(callsign1, callsign2) {
    const active = this.getActiveFlights();
    const f1 = callsign1 ? this.flights.get(callsign1) : pick(active);
    const f2 = callsign2 ? this.flights.get(callsign2) : active.find(f => f !== f1);
    if (!f1 || !f2) throw new Error('Flights not found for conflict injection');
    const result = this.alertGen.createConflict(f1, f2);
    logger.warn(`CONFLICT INJECTED: ${f1.callsign} vs ${f2.callsign}`);
    return result;
  }

  async injectEmergency(callsign) {
    const flight = callsign ? this.flights.get(callsign) : pick(this.getActiveFlights());
    if (!flight) throw new Error('Flight not found for emergency injection');
    const type = pick(['7700', '7600', '7500']);
    const result = this.alertGen.setEmergencySquawk(flight, type);
    logger.warn(`EMERGENCY INJECTED: ${flight.callsign} squawk ${type}`);
    return result;
  }

  async injectSigmet(data) {
    const sigmet = data || this.weatherGen.generateSigmet(true);
    await this.publisher.sendSigmet(sigmet);
    logger.warn(`SIGMET INJECTED: ${sigmet.phenomenon}`);
    return sigmet;
  }

  async injectMissedApproach(callsign) {
    const approaching = this.getActiveFlights().filter(f => f._sim.phase === 'APPROACH' || f._sim.phase === 'DESCENT');
    const flight = callsign ? this.flights.get(callsign) : pick(approaching);
    if (!flight) throw new Error('No approaching flight found');
    const result = this.alertGen.missedApproach(flight);
    logger.warn(`MISSED APPROACH INJECTED: ${flight.callsign}`);
    return result;
  }

  // ─── PRIVATE ──────────────────────────────────────────────────────────────────
  async _seedFlights(count) {
    const seeds = [];
    for (let i = 0; i < count; i++) {
      const flight = this.flightGen.generateFlightPlan();
      // Distribute aircraft at various flight phases
      const phase = i < count * 0.1 ? 'CLIMB'
                  : i < count * 0.8 ? 'CRUISE'
                  : 'DESCENT';
      flight._sim.phase = phase;
      flight._sim.status = 'ACTIVE';

      if (phase === 'CRUISE') {
        flight._sim.altitude = flight._sim.cruiseAlt;
        flight._sim.speed    = flight._sim.cruiseSpeed;
        // Spread across the FIR
        flight._sim.lat += rand(-3, 3);
        flight._sim.lon += rand(-3, 3);
      } else if (phase === 'DESCENT') {
        flight._sim.altitude = rand(8000, 20000);
        flight._sim.speed    = rand(250, 380);
      }

      this.flights.set(flight.callsign, flight);
      seeds.push(flight);
    }

    // File all flight plans
    await Promise.all(seeds.map(f => this.publisher.sendFlightPlan(f)));

    // Send initial positions in one batch
    const initPositions = seeds.map(f => ({
      callsign: f.callsign, icao24: f._sim.icao24,
      lat: f._sim.lat, lon: f._sim.lon,
      altitude: f._sim.altitude, ground_speed: f._sim.speed,
      track: f._sim.heading, vertical_rate: 0,
      squawk: f._sim.squawk, signal_quality: 0.9, source: 'ADS_B',
      phase: f._sim.phase,
    }));
    await this.publisher.sendPositions(initPositions);
    logger.info(`Seeded ${count} flights`);
  }

  async _forceConflict() {
    const cruising = this.getActiveFlights().filter(f => f._sim.phase === 'CRUISE');
    if (cruising.length < 2) return null;
    const f1 = cruising[0], f2 = cruising[1];
    return this.alertGen.createConflict(f1, f2);
  }

  async _triggerEmergency() {
    const active = this.getActiveFlights();
    if (!active.length) return null;
    const flight = pick(active);
    const type = pick(['7700', '7700', '7600', '7500']); // 7700 most common
    return this.alertGen.setEmergencySquawk(flight, type);
  }

  async _randomMinorEvent(active) {
    const roll = Math.random();
    if (roll < 0.4) {
      // Altitude deviation
      const f = pick(active.filter(f => f._sim.phase === 'CRUISE'));
      if (f) return this.alertGen.altitudeDeviation(f);
    } else if (roll < 0.7) {
      // PIREP
      const f = pick(active);
      if (f) {
        const pirep = this.weatherGen.generatePirep(f.callsign, f._sim.lat, f._sim.lon, f._sim.altitude);
        await this.publisher.sendPirep(pirep);
        return { type: 'PIREP', callsign: f.callsign };
      }
    }
    return null;
  }
}
