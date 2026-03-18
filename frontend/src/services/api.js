// services/api.js
import axios from 'axios';
import { store } from '../store/store';
import { clearAuth } from '../store/authSlice';

const BASE = import.meta.env.VITE_API_URL || '/api';

const http = axios.create({ baseURL: BASE, headers: { 'Content-Type': 'application/json' } });

http.interceptors.request.use((cfg) => {
  const token = store.getState().auth.token;
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

http.interceptors.response.use(
  (r) => r.data,
  (err) => {
    if (err.response?.status === 401) store.dispatch(clearAuth());
    return Promise.reject(err);
  }
);

// ─── FDPS ─────────────────────────────────────────────────────────────────────
export const flightAPI = {
  getFlights:          (params = {}) => http.get('/fdps/flights', { params }),
  getFlight:           (id) => http.get(`/fdps/flights/${id}`),
  createFlight:        (data) => http.post('/fdps/flights', data),
  updateFlight:        (id, data) => http.put(`/fdps/flights/${id}`, data),
  getTrajectory:       (id) => http.get(`/fdps/trajectories/${id}`),
  calcTrajectory:      (id, data) => http.post(`/fdps/trajectories/${id}`, data),
  checkConflicts:      (id1, id2) => http.post('/fdps/check-conflicts', { flightId1: id1, flightId2: id2 }),
  assignSector:        (id, data) => http.post(`/fdps/flights/${id}/assign-sector`, data),
};

// ─── SNET ─────────────────────────────────────────────────────────────────────
export const alertAPI = {
  getAlerts:           (params = {}) => http.get('/snet/alerts', { params }),
  dismissAlert:        (id, action) => http.put(`/snet/alerts/${id}/dismiss`, { resolutionAction: action }),
  detectConflicts:     () => http.post('/snet/detect-conflicts'),
  checkSeparation:     (id1, id2) => http.post('/snet/check-separation', { flightId1: id1, flightId2: id2 }),
  checkMsaw:           () => http.post('/snet/check-msaw'),
};

// ─── SURVEILLANCE ─────────────────────────────────────────────────────────────
export const surveillanceAPI = {
  getPicture:          (params = {}) => http.get('/surveillance/picture', { params }),
  getTrack:            (callsign, minutes = 60) => http.get(`/surveillance/flights/${callsign}/track`, { params: { minutes } }),
  getEmergencies:      () => http.get('/surveillance/squawks/emergency'),
};

// ─── COORDINATION ─────────────────────────────────────────────────────────────
export const coordinationAPI = {
  getHandoffs:         (params = {}) => http.get('/coordination/handoffs', { params }),
  initiateHandoff:     (data) => http.post('/coordination/handoffs', data),
  acceptHandoff:       (id) => http.put(`/coordination/handoffs/${id}/accept`),
  transferHandoff:     (id) => http.put(`/coordination/handoffs/${id}/transfer`),
  getSectors:          () => http.get('/coordination/sectors'),
  issueClearance:      (data) => http.post('/coordination/clearances', data),
  getClearances:       (flightId) => http.get(`/coordination/clearances/${flightId}`),
};

// ─── WEATHER ──────────────────────────────────────────────────────────────────
export const weatherAPI = {
  getMetar:            (icao) => http.get(`/weather/metar/${icao}`),
  getTaf:              (icao) => http.get(`/weather/taf/${icao}`),
  getSigmets:          (fir) => http.get('/weather/sigmets', { params: { fir } }),
  predictHazards:      (params) => http.get('/weather/hazards/predict', { params }),
  submitPirep:         (data) => http.post('/weather/pireps', data),
};

// ─── ANALYTICS ────────────────────────────────────────────────────────────────
export const analyticsAPI = {
  getKpis:             () => http.get('/analytics/kpis'),
  getSectorMetrics:    () => http.get('/analytics/sectors/metrics'),
  getDelays:           (params = {}) => http.get('/analytics/delays', { params }),
  getSafetyTrends:     (days = 30) => http.get('/analytics/safety/trends', { params: { days } }),
  getControllerWorkload: () => http.get('/analytics/workload/controllers'),
  getTrafficFlow:      (params = {}) => http.get('/analytics/traffic/flow', { params }),
};

// ─── ML ───────────────────────────────────────────────────────────────────────
export const mlAPI = {
  predictConflict:     (f1, f2) => http.post('/ml/predict/conflict', { flight1: f1, flight2: f2 }),
  detectAnomaly:       (data) => http.post('/ml/detect/anomaly', data),
  forecastDemand:      (airport, hours) => http.get('/ml/forecast/demand', { params: { airport, hours_ahead: hours } }),
  assessAirspace:      () => http.get('/ml/assess/airspace'),
  predictRunway:       (data) => http.post('/ml/predict/runway-incursion', data),
};

export default http;
