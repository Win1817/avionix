// simulator-service/src/publishers/data-publisher.js
// Sends generated data to AVIONIX services via HTTP REST

import { createLogger } from '../../../shared/utils/helpers.js';

const logger = createLogger('SIM-PUBLISHER');

export class DataPublisher {
  constructor(config) {
    this.config = config;
    this.authHeader = config.simToken
      ? { Authorization: `Bearer ${config.simToken}` }
      : {};
  }

  /**
   * POST position batch to data-ingest-service
   */
  async sendPositions(positions) {
    if (!positions.length) return;
    return this._post(`${this.config.ingestUrl}/ingest/adsb`, {
      aircraft: positions.map(p => ({
        flight:    p.callsign,
        hex:       p.icao24,
        lat:       p.lat,
        lon:       p.lon,
        altitude:  p.altitude,
        speed:     p.ground_speed,
        track:     p.track,
        vert_rate: p.vertical_rate,
        squawk:    p.squawk,
        rssi:      p.signal_quality,
      }))
    });
  }

  /**
   * POST new flight plan to FDPS
   */
  async sendFlightPlan(flight) {
    const { _sim, ...plan } = flight;
    return this._post(`${this.config.gatewayUrl}/api/fdps/flights`, plan);
  }

  /**
   * POST METAR to weather-service
   */
  async sendMetar(metar) {
    return this._post(`${this.config.gatewayUrl}/api/weather/metar`, metar);
  }

  /**
   * POST SIGMET to weather-service
   */
  async sendSigmet(sigmet) {
    return this._post(`${this.config.gatewayUrl}/api/weather/sigmets`, sigmet);
  }

  /**
   * POST PIREP to weather-service
   */
  async sendPirep(pirep) {
    return this._post(`${this.config.gatewayUrl}/api/weather/pireps`, pirep);
  }

  async _post(url, body) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeader },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        logger.debug(`POST ${url} → ${res.status}`, { body: text.slice(0, 200) });
      }
      return res.ok;
    } catch (e) {
      // Swallow network errors — services may not be ready yet
      if (e.name !== 'AbortError') {
        logger.debug(`POST ${url} failed: ${e.message}`);
      }
      return false;
    }
  }
}
