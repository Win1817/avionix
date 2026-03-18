// data-ingest-service/src/parsers/adsb-parser.js
// Parses dump1090/VRS JSON ADS-B format into normalized position reports

export class ADSBParser {
  parse(item) {
    if (!item) return null;
    const lat = item.lat ?? item.Lat ?? item.latitude;
    const lon = item.lon ?? item.Long ?? item.longitude;
    if (lat == null || lon == null) return null;

    return {
      callsign:     (item.flight ?? item.Callsign ?? item.callsign ?? '').trim() || null,
      icao24:       item.hex ?? item.Icao ?? item.icao24 ?? null,
      lat:          parseFloat(lat),
      lon:          parseFloat(lon),
      altitude:     this._parseAlt(item.altitude ?? item.Alt ?? item.alt_baro ?? item.altitude_baro),
      groundSpeed:  item.speed ?? item.Spd ?? item.gs ?? null,
      track:        item.track ?? item.Trak ?? item.true_heading ?? null,
      verticalRate: item.vert_rate ?? item.Vsi ?? item.baro_rate ?? 0,
      squawk:       item.squawk ?? item.Sqk ?? null,
      rssi:         item.rssi ?? item.Sig ?? 1.0,
      category:     item.category ?? null,
      onGround:     item.onGround ?? item.Gnd ?? false,
    };
  }

  _parseAlt(raw) {
    if (raw == null || raw === 'ground') return 0;
    return parseInt(raw) || 0;
  }
}
