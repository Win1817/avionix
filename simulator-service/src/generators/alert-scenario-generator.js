// simulator-service/src/generators/alert-scenario-generator.js
// Generates specific ATC alert scenarios for testing safety nets

const rand = (min, max) => Math.random() * (max - min) + min;

export class AlertScenarioGenerator {
  /**
   * Force two flights onto a converging course (STCA trigger)
   * Returns modified position data for both flights
   */
  createConflict(flight1, flight2) {
    const midLat = (flight1._sim.lat + flight2._sim.lat) / 2;
    const midLon = (flight1._sim.lon + flight2._sim.lon) / 2;
    const offset = 0.04; // ~2.4 NM apart

    // Place both at same altitude within separation minima
    const sharedAlt = Math.round((flight1._sim.cruiseAlt + flight2._sim.cruiseAlt) / 2 / 100) * 100;

    // Move toward each other
    flight1._sim.lat = midLat + offset;
    flight1._sim.lon = midLon + offset;
    flight1._sim.altitude = sharedAlt;
    flight1._sim.heading  = 225; // SW — converging

    flight2._sim.lat = midLat - offset;
    flight2._sim.lon = midLon - offset;
    flight2._sim.altitude = sharedAlt;
    flight2._sim.heading  = 45;  // NE — converging

    return { flight1: flight1.callsign, flight2: flight2.callsign, separationNM: offset * 2 * 60 };
  }

  /**
   * Set emergency squawk on a flight
   */
  setEmergencySquawk(flight, type = '7700') {
    const descriptions = { '7700': 'GENERAL EMERGENCY', '7600': 'COMMS FAILURE', '7500': 'HIJACK' };
    flight._sim.squawk = type;
    flight._sim.emergencyType = descriptions[type];
    return { callsign: flight.callsign, squawk: type, type: descriptions[type] };
  }

  /**
   * Simulate missed approach — aircraft climbs back from approach
   */
  missedApproach(flight) {
    flight._sim.phase = 'CLIMB';
    flight._sim.heading = (flight._sim.heading + 180) % 360;
    flight._sim.speed = Math.min(250, flight._sim.speed + 50);
    return { callsign: flight.callsign, event: 'MISSED_APPROACH' };
  }

  /**
   * Simulate MSAW — push aircraft below safe altitude
   */
  createMSAW(flight) {
    flight._sim.altitude = rand(800, 2000);
    flight._sim.phase = 'DESCENT';
    return { callsign: flight.callsign, altitude: flight._sim.altitude, event: 'MSAW' };
  }

  /**
   * Simulate unexpected altitude deviation
   */
  altitudeDeviation(flight) {
    const deviation = rand(500, 1500) * (Math.random() > 0.5 ? 1 : -1);
    flight._sim.altitude = Math.max(5000, flight._sim.altitude + deviation);
    return { callsign: flight.callsign, deviation, event: 'ALTITUDE_DEVIATION' };
  }
}
