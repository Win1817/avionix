// shared/utils/helpers.js

export const createSuccessResponse = (data, message = 'OK') => ({
  success: true, message, data, timestamp: new Date().toISOString()
});

export const createErrorResponse = (code, message, details = null) => ({
  success: false, error: { code, message, details }, timestamp: new Date().toISOString()
});

export const calculateDistanceNM = (lat1, lon1, lat2, lon2) => {
  const R = 3440.065; // Earth radius in NM
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export const FLIGHT_STATUS = {
  FILED: 'FILED', ACTIVATED: 'ACTIVATED', AIRBORNE: 'AIRBORNE',
  ACTIVE: 'ACTIVE', LANDED: 'LANDED', CANCELLED: 'CANCELLED', DIVERTED: 'DIVERTED'
};

export const ALERT_TYPE = {
  STCA: 'STCA', MSAW: 'MSAW', APW: 'APW', CLAM: 'CLAM',
  CONFLICT: 'CONFLICT', AIRSPACE: 'AIRSPACE', WEATHER: 'WEATHER', SYSTEM: 'SYSTEM'
};

export const ALERT_SEVERITY = { CRITICAL: 'CRITICAL', HIGH: 'HIGH', MEDIUM: 'MEDIUM', LOW: 'LOW' };

export const DEFAULT_SEPARATION_MINIMA = {
  HORIZONTAL_ENROUTE: 5, VERTICAL_ENROUTE: 1000,
  HORIZONTAL_TERMINAL: 3, VERTICAL_TERMINAL: 1000,
  HORIZONTAL_RVSM: 5, VERTICAL_RVSM: 1000
};

export const TIME_CONSTANTS = {
  TRAJECTORY_HORIZON_MINUTES: 20,
  STCA_LOOKAHEAD_SECONDS: 120,
  POSITION_STALE_SECONDS: 120
};

export const isValidCallsign = (cs) => /^[A-Z]{3}\d{1,4}[A-Z]{0,2}$/.test(cs);
export const isValidAirportCode = (code) => /^[A-Z]{4}$/.test(code);
export const isValidAltitude = (alt) => Number.isInteger(alt) && alt >= 0 && alt <= 60000;

export const createLogger = (service) => ({
  info: (msg, meta = {}) => console.log(JSON.stringify({ level: 'INFO', service, msg, ...meta, ts: new Date().toISOString() })),
  warn: (msg, meta = {}) => console.warn(JSON.stringify({ level: 'WARN', service, msg, ...meta, ts: new Date().toISOString() })),
  error: (msg, meta = {}) => console.error(JSON.stringify({ level: 'ERROR', service, msg, ...meta, ts: new Date().toISOString() })),
  debug: (msg, meta = {}) => process.env.LOG_LEVEL === 'debug' && console.debug(JSON.stringify({ level: 'DEBUG', service, msg, ...meta, ts: new Date().toISOString() }))
});
