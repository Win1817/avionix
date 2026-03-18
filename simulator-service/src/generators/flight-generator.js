// simulator-service/src/generators/flight-generator.js
// Generates realistic flight plans for Philippine FIR (RPHI) airspace

const AIRLINES = [
  { icao: 'PAL', iata: 'PR', name: 'Philippine Airlines',    prefix: 'PAL' },
  { icao: 'CEB', iata: '5J', name: 'Cebu Pacific',           prefix: 'CEB' },
  { icao: 'AXM', iata: 'Z2', name: 'AirAsia Philippines',    prefix: 'AXM' },
  { icao: 'GAP', iata: 'ZZ', name: 'Airswift',               prefix: 'RHG' },
  { icao: 'UAL', iata: 'UA', name: 'United Airlines',         prefix: 'UAL' },
  { icao: 'KAL', iata: 'KE', name: 'Korean Air',             prefix: 'KAL' },
  { icao: 'JAL', iata: 'JL', name: 'Japan Airlines',         prefix: 'JAL' },
  { icao: 'CPA', iata: 'CX', name: 'Cathay Pacific',         prefix: 'CPA' },
  { icao: 'SIA', iata: 'SQ', name: 'Singapore Airlines',     prefix: 'SIA' },
  { icao: 'QFA', iata: 'QF', name: 'Qantas',                 prefix: 'QFA' },
  { icao: 'ANA', iata: 'NH', name: 'All Nippon Airways',     prefix: 'ANA' },
  { icao: 'EVA', iata: 'BR', name: 'EVA Air',                prefix: 'EVA' },
  { icao: 'MAS', iata: 'MH', name: 'Malaysia Airlines',      prefix: 'MAS' },
];

const AIRCRAFT_TYPES = [
  { type: 'B77W', weight: 'H', cruise: 490, climbRate: 1800 },
  { type: 'B789', weight: 'H', cruise: 483, climbRate: 1900 },
  { type: 'A333', weight: 'H', cruise: 470, climbRate: 1600 },
  { type: 'A359', weight: 'H', cruise: 488, climbRate: 1800 },
  { type: 'B738', weight: 'M', cruise: 450, climbRate: 2000 },
  { type: 'A320', weight: 'M', cruise: 447, climbRate: 2100 },
  { type: 'A321', weight: 'M', cruise: 448, climbRate: 1900 },
  { type: 'B737', weight: 'M', cruise: 445, climbRate: 1800 },
  { type: 'ATR7', weight: 'M', cruise: 280, climbRate: 1200 },
  { type: 'DH8D', weight: 'M', cruise: 310, climbRate: 1400 },
];

// Philippine airports with coordinates
export const AIRPORTS = {
  RPLL: { name: 'Ninoy Aquino International', lat: 14.5086, lon: 121.0197, elev: 75 },
  RPVM: { name: 'Mactan-Cebu International',  lat: 10.3075, lon: 123.9789, elev: 31 },
  RPVD: { name: 'Francisco Bangoy International (Davao)', lat: 7.1255, lon: 125.6458, elev: 93 },
  RPMZ: { name: 'Zamboanga International',    lat: 6.9224, lon: 122.0599, elev: 33 },
  RPVK: { name: 'Kalibo International',       lat: 11.6793, lon: 122.3757, elev: 14 },
  RPSP: { name: 'Puerto Princesa International', lat: 9.7421, lon: 118.7590, elev: 71 },
  RPLB: { name: 'Subic Bay International',    lat: 14.7944, lon: 120.2706, elev: 21 },
  RPMN: { name: 'Laoag International',        lat: 18.1781, lon: 120.5314, elev: 25 },
  RPVB: { name: 'Bacolod-Silay International', lat: 10.7765, lon: 123.0150, elev: 82 },
  RJTT: { name: 'Tokyo Haneda',               lat: 35.5494, lon: 139.7798, elev: 9 },
  RJBB: { name: 'Osaka Kansai',               lat: 34.4272, lon: 135.2440, elev: 5 },
  RKSI: { name: 'Incheon International',      lat: 37.4602, lon: 126.4407, elev: 9 },
  VHHH: { name: 'Hong Kong International',    lat: 22.3080, lon: 113.9185, elev: 9 },
  WSSS: { name: 'Singapore Changi',           lat: 1.3644,  lon: 103.9915, elev: 7 },
  KLAX: { name: 'Los Angeles International',  lat: 33.9425, lon: -118.4081, elev: 38 },
};

// Typical Philippine domestic/international routes with airways
const ROUTES = [
  { dep: 'RPLL', dest: 'RPVM', route: 'ENARI V69 VIDEN', alt: 24000, dur: 55 },
  { dep: 'RPLL', dest: 'RPVD', route: 'ENARI W13 APARI', alt: 28000, dur: 95 },
  { dep: 'RPLL', dest: 'RPMZ', route: 'ENARI W13 BORDO', alt: 26000, dur: 80 },
  { dep: 'RPLL', dest: 'RPSP', route: 'ENARI DCT PUSIT', alt: 22000, dur: 75 },
  { dep: 'RPLL', dest: 'RPMN', route: 'BULAN DCT OMBAR', alt: 18000, dur: 50 },
  { dep: 'RPVM', dest: 'RPLL', route: 'VIDEN V69 ENARI', alt: 24000, dur: 55 },
  { dep: 'RPVM', dest: 'RPVD', route: 'ALKAN DCT MELIT', alt: 20000, dur: 45 },
  { dep: 'RPLL', dest: 'RJTT', route: 'ENARI IGARI M750 LAMEN',  alt: 35000, dur: 255 },
  { dep: 'RPLL', dest: 'RKSI', route: 'ENARI APARI M300 BEKOL',  alt: 35000, dur: 205 },
  { dep: 'RPLL', dest: 'VHHH', route: 'ENARI G582 ELATO',        alt: 33000, dur: 145 },
  { dep: 'RPLL', dest: 'WSSS', route: 'ENARI W13 SAROX',         alt: 35000, dur: 200 },
  { dep: 'RPLL', dest: 'RJBB', route: 'ENARI IGARI A590 REVNU',  alt: 35000, dur: 265 },
];

const SQUAWK_POOL = Array.from({ length: 200 }, (_, i) =>
  String(2000 + i).padStart(4, '0')
);
let squawkIdx = 0;

const rand = (min, max) => Math.random() * (max - min) + min;
const randInt = (min, max) => Math.floor(rand(min, max + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let flightSeq = 100;

export class FlightGenerator {
  generateFlightPlan(overrides = {}) {
    const airline  = pick(AIRLINES);
    const aircraft = pick(AIRCRAFT_TYPES);
    const route    = pick(ROUTES);
    const dep      = AIRPORTS[route.dep];
    const dest     = AIRPORTS[route.dest];
    const depTime  = new Date(Date.now() + randInt(-900000, 300000)); // -15 to +5 min

    const callsign = `${airline.prefix}${flightSeq++}`;
    const reg      = `RP-${String.fromCharCode(65 + randInt(0, 25))}${randInt(100, 999)}`;

    return {
      callsign,
      aircraft_type:         aircraft.type,
      aircraft_registration: reg,
      departure_airport:     route.dep,
      destination_airport:   route.dest,
      departure_time:        depTime.toISOString(),
      cruise_altitude:       route.alt,
      cruise_speed:          aircraft.cruise,
      flight_rules:          'I',
      operator_icao:         airline.icao,
      route:                 route.route,
      waypoints:             this._buildWaypoints(dep, dest),
      fuel_weight:           randInt(8000, 45000),
      passenger_count:       randInt(80, 400),
      special_handling:      null,
      // Simulation metadata (not sent to API)
      _sim: {
        lat:        dep.lat + rand(-0.1, 0.1),
        lon:        dep.lon + rand(-0.1, 0.1),
        altitude:   dep.elev,
        speed:      0,
        heading:    this._bearing(dep, dest),
        climbRate:  aircraft.climbRate,
        cruiseAlt:  route.alt,
        cruiseSpeed: aircraft.cruise,
        destLat:    dest.lat,
        destLon:    dest.lon,
        phase:      'CLIMB',  // CLIMB | CRUISE | DESCENT | LANDED
        squawk:     SQUAWK_POOL[squawkIdx++ % SQUAWK_POOL.length],
        icao24:     Math.floor(Math.random() * 0xFFFFFF).toString(16).padStart(6, '0').toUpperCase(),
        distToDestNM: this._distNM(dep.lat, dep.lon, dest.lat, dest.lon),
        distTravelledNM: 0,
        status: 'ACTIVE',
      },
      ...overrides,
    };
  }

  _buildWaypoints(dep, dest) {
    // Intermediate point at midpoint
    return [
      { id: 'DEP', lat: dep.lat, lon: dep.lon },
      { id: 'MID', lat: (dep.lat + dest.lat) / 2, lon: (dep.lon + dest.lon) / 2 },
      { id: 'DEST', lat: dest.lat, lon: dest.lon },
    ];
  }

  _bearing(from, to) {
    const dLon = (to.lon - from.lon) * Math.PI / 180;
    const lat1 = from.lat * Math.PI / 180;
    const lat2 = to.lat  * Math.PI / 180;
    const y = Math.sin(dLon) * Math.cos(lat2);
    const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  }

  _distNM(lat1, lon1, lat2, lon2) {
    const R = 3440.065;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
}
