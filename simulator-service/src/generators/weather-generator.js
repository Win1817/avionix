// simulator-service/src/generators/weather-generator.js
// Generates realistic aviation weather products for Philippine FIR

const STATIONS = ['RPLL', 'RPVM', 'RPVD', 'RPMZ', 'RPSP'];
const rand  = (min, max) => Math.random() * (max - min) + min;
const rInt  = (min, max) => Math.floor(rand(min, max + 1));
const pick  = (arr) => arr[Math.floor(Math.random() * arr.length)];

export class WeatherGenerator {
  generateMetar(station = 'RPLL') {
    const windDir   = rInt(0, 35) * 10;
    const windSpd   = rInt(3, 25);
    const windGust  = windSpd > 15 ? windSpd + rInt(5, 15) : null;
    const vis       = pick([1, 2, 3, 5, 6, 7, 9, 10, 10]);
    const temp      = rInt(24, 34);
    const dewpt     = temp - rInt(2, 8);
    const altimeter = parseFloat((29.5 + rand(-0.3, 0.3)).toFixed(2));
    const ceiling   = pick([null, null, null, 1500, 2500, 3500, 5000]);
    const wxCodes   = vis < 5 ? pick([['RA'], ['TSRA'], ['BR'], ['FG']]) : [];

    const rawText = [
      `${station} ${this._zuluTime()}Z`,
      `${String(windDir).padStart(3, '0')}${String(windSpd).padStart(2, '0')}${windGust ? `G${windGust}` : ''}KT`,
      `${vis === 10 ? '9999' : `${vis}SM`}`,
      wxCodes.join(''),
      ceiling ? `BKN${String(Math.round(ceiling / 100)).padStart(3, '0')}` : 'SKC',
      `${temp < 0 ? 'M' : ''}${String(Math.abs(temp)).padStart(2, '0')}/${dewpt < 0 ? 'M' : ''}${String(Math.abs(dewpt)).padStart(2, '0')}`,
      `A${String(Math.round(altimeter * 100)).padStart(4, '0')}`,
    ].filter(Boolean).join(' ');

    return {
      station_icao:    station,
      raw_text:        rawText,
      wind_dir:        windDir,
      wind_speed:      windSpd,
      wind_gust:       windGust,
      visibility:      vis,
      ceiling:         ceiling,
      temperature:     temp,
      dewpoint:        dewpt,
      altimeter:       altimeter,
      weather_codes:   wxCodes,
    };
  }

  generateAllMetars() {
    return STATIONS.map(s => this.generateMetar(s));
  }

  generateSigmet(severe = false) {
    const phenomena = severe
      ? ['TS', 'TC', 'SEV_ICE']
      : ['TURB', 'ICE', 'TS', 'MTW'];
    const phenom = pick(phenomena);
    const now = Date.now();
    const validFrom = new Date(now).toISOString();
    const validTo   = new Date(now + 6 * 3600000).toISOString();
    const levelLower = rInt(100, 200) * 100;
    const levelUpper = levelLower + rInt(100, 250) * 100;

    // Random polygon over Philippine Sea
    const centerLat = rand(10, 17);
    const centerLon = rand(118, 127);
    const r = rand(1, 3);
    const polygon = [
      [centerLat - r, centerLon - r],
      [centerLat + r, centerLon - r],
      [centerLat + r, centerLon + r],
      [centerLat - r, centerLon + r],
    ];

    const phenomena_map = {
      TS: 'TS OBS MOV NE 30KT INTSF', TURB: 'SEV TURB FCST', ICE: 'SEV ICE OBS',
      TC: 'TC ROSITA OBS N1500 E12200 MOV NW 15KT', SEV_ICE: 'SEV ICE AND FZRA OBS',
      MTW: 'SEV MTW OBS'
    };

    return {
      fir: 'RPHI',
      phenomenon: phenom,
      level_lower: levelLower,
      level_upper: levelUpper,
      area_polygon: polygon,
      intensity: pick(['INTSF', 'WKN', 'STNR']),
      movement: 'MOV NE 20KT',
      valid_from: validFrom,
      valid_to: validTo,
      raw_text: `RPHI SIGMET ${rInt(1, 9)} VALID ${this._zuluTime()}/+0600 RPLL - RPHI MANILA FIR ${phenomena_map[phenom]}`,
    };
  }

  generatePirep(callsign, lat, lon, altitude) {
    const turbIntensities = [null, null, 'LIGHT', 'LIGHT_MODERATE', 'MODERATE'];
    const iceIntensities  = [null, null, null, 'LIGHT', 'MODERATE'];
    return {
      callsign,
      lat:  parseFloat((lat + rand(-0.5, 0.5)).toFixed(4)),
      lon:  parseFloat((lon + rand(-0.5, 0.5)).toFixed(4)),
      altitude,
      turbulence_intensity: pick(turbIntensities),
      icing_intensity:      pick(iceIntensities),
      wind_dir:   rInt(200, 310),
      wind_speed: rInt(15, 60),
      temperature: -Math.abs(altitude / 1000 * 2 - 15) + rand(-3, 3),
      remarks: 'SIM',
    };
  }

  _zuluTime() {
    const now = new Date();
    return `${String(now.getUTCDate()).padStart(2,'0')}${String(now.getUTCHours()).padStart(2,'0')}${String(now.getUTCMinutes()).padStart(2,'0')}`;
  }
}
