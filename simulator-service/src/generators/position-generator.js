// simulator-service/src/generators/position-generator.js
// Advances aircraft positions using realistic aviation physics

const NM_PER_DEG_LAT = 1 / 60;

export class PositionGenerator {
  /**
   * Advance all active flights by one tick (intervalMs)
   * Returns array of updated position reports
   */
  tick(flights, intervalMs) {
    const updates = [];
    const intervalHours = intervalMs / 3600000;

    for (const flight of flights) {
      const sim = flight._sim;
      if (!sim || sim.status === 'LANDED') continue;

      const distNM = sim.speed * intervalHours;
      const trackRad = (sim.heading * Math.PI) / 180;
      const nmPerDegLon = NM_PER_DEG_LAT / Math.cos((sim.lat * Math.PI) / 180);

      // Update position
      sim.lat += distNM * Math.cos(trackRad) * NM_PER_DEG_LAT;
      sim.lon += distNM * Math.sin(trackRad) * nmPerDegLon;
      sim.distTravelledNM += distNM;

      // Recalculate heading toward destination (minor correction each tick)
      const newHeading = this._bearing(sim.lat, sim.lon, sim.destLat, sim.destLon);
      sim.heading = sim.heading * 0.95 + newHeading * 0.05; // smooth turn

      // Distance to destination
      const distRemaining = this._distNM(sim.lat, sim.lon, sim.destLat, sim.destLon);

      // Phase transitions
      switch (sim.phase) {
        case 'CLIMB':
          sim.altitude = Math.min(sim.cruiseAlt, sim.altitude + (sim.climbRate * intervalMs / 60000));
          sim.speed = Math.min(sim.cruiseSpeed * 0.5, sim.speed + 5); // accelerate
          if (sim.altitude >= sim.cruiseAlt * 0.98) {
            sim.phase = 'CRUISE';
            sim.speed = sim.cruiseSpeed;
            sim.altitude = sim.cruiseAlt;
          }
          break;

        case 'CRUISE':
          // Minor altitude variation (±100 ft)
          sim.altitude += (Math.random() - 0.5) * 50;
          sim.altitude = Math.max(sim.cruiseAlt - 200, Math.min(sim.cruiseAlt + 200, sim.altitude));
          // Minor speed variation (±5 kt)
          sim.speed += (Math.random() - 0.5) * 2;
          sim.speed = Math.max(sim.cruiseSpeed - 20, Math.min(sim.cruiseSpeed + 20, sim.speed));
          if (distRemaining < 80) sim.phase = 'DESCENT';
          break;

        case 'DESCENT':
          sim.altitude = Math.max(3000, sim.altitude - (sim.climbRate * 0.7 * intervalMs / 60000));
          sim.speed = Math.max(180, sim.speed - 3);
          if (distRemaining < 5 || sim.altitude <= 3000) {
            sim.phase = 'APPROACH';
            sim.altitude = Math.max(2500, sim.altitude);
          }
          break;

        case 'APPROACH':
          sim.altitude = Math.max(sim.destElev || 50, sim.altitude - (sim.climbRate * 0.4 * intervalMs / 60000));
          sim.speed = Math.max(130, sim.speed - 5);
          if (distRemaining < 1.5 || sim.altitude <= 200) {
            sim.phase = 'LANDED';
            sim.status = 'LANDED';
            sim.altitude = sim.destElev || 50;
            sim.speed = 0;
          }
          break;
      }

      // Vertical rate
      const verticalRate = sim.phase === 'CLIMB' ? sim.climbRate
        : sim.phase === 'DESCENT' || sim.phase === 'APPROACH' ? -sim.climbRate * 0.7
        : (Math.random() - 0.5) * 100;

      // Wind effect (simplified)
      const windDrift = 0.0003 * Math.sin(Date.now() / 600000);
      sim.lat += windDrift * intervalHours;

      updates.push({
        callsign:     flight.callsign,
        icao24:       sim.icao24,
        lat:          parseFloat(sim.lat.toFixed(6)),
        lon:          parseFloat(sim.lon.toFixed(6)),
        altitude:     Math.round(sim.altitude / 100) * 100,
        ground_speed: Math.round(sim.speed),
        track:        Math.round(sim.heading),
        vertical_rate: Math.round(verticalRate),
        squawk:       sim.squawk,
        signal_quality: parseFloat((0.7 + Math.random() * 0.3).toFixed(2)),
        source:       'ADS_B',
        phase:        sim.phase,
      });
    }

    return updates;
  }

  _bearing(lat1, lon1, lat2, lon2) {
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2 * Math.PI / 180);
    const x = Math.cos(lat1 * Math.PI / 180) * Math.sin(lat2 * Math.PI / 180)
            - Math.sin(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }

  _distNM(lat1, lon1, lat2, lon2) {
    const R = 3440.065;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
}
