// data-ingest-service/src/parsers/asterix-parser.js
// Simplified ASTERIX CAT021 / CAT048 parser

export class ASTERIXParser {
  parse(buffer, category = 21) {
    // In production this would fully decode ASTERIX binary format.
    // This implementation returns a stub — integrate with a library like node-asterix.
    const records = [];
    try {
      // Category byte is at offset 0; length is bytes 1-2 (big endian)
      let offset = 0;
      while (offset < buffer.length) {
        const cat = buffer[offset];
        if (cat !== category) break;
        const len = buffer.readUInt16BE(offset + 1);
        if (len <= 3) break;
        // Placeholder: emit a stub record per block
        records.push({
          callsign: null,
          target_address: buffer.slice(offset + 3, offset + 6).toString('hex').toUpperCase(),
          lat: null, lon: null, altitude: null,
          groundSpeed: null, track: null, squawk: null,
          source: `ASTERIX_CAT${category}`
        });
        offset += len;
      }
    } catch (e) {
      // Partial parse — return what we have
    }
    return records;
  }
}

// data-ingest-service/src/parsers/fixm-parser.js
// ICAO FIXM 4.3 flight plan parser (JSON subset)

export class FIXMParser {
  parse(raw, format = 'json') {
    if (format === 'json') return this._fromJson(raw);
    // XML parsing would require xmldom or fast-xml-parser
    throw new Error('XML FIXM parsing requires additional library');
  }

  _fromJson(plan) {
    // Support both direct FIXM and simplified formats
    const flight = plan.flight ?? plan;
    const id = flight.flightIdentification ?? {};
    const dep = flight.departure ?? {};
    const arr = flight.arrival ?? {};
    const ac  = flight.aircraft ?? {};
    const fp  = flight.flightPlan ?? {};

    return {
      callsign:     id.aircraftIdentification ?? plan.callsign,
      aircraftType: ac.icaoAircraftTypeDesignator ?? ac.type ?? plan.aircraft_type,
      registration: ac.registration ?? plan.registration,
      depAirport:   dep.departureAerodrome?.locationIndicator ?? dep.icao ?? plan.departure_airport,
      destAirport:  arr.destinationAerodrome?.locationIndicator ?? arr.icao ?? plan.destination_airport,
      depTime:      dep.estimatedOffBlockTime ?? dep.time ?? plan.departure_time,
      cruiseAlt:    fp.cruisingLevel?.altitude?.value ?? fp.altitude ?? plan.cruise_altitude,
      cruiseSpeed:  fp.cruisingSpeed?.speed ?? plan.cruise_speed,
      flightRules:  fp.flightRules ?? plan.flight_rules ?? 'I',
      operator:     flight.operator?.icaoDesignator ?? plan.operator_icao,
      route:        fp.routeText ?? plan.route,
    };
  }
}
