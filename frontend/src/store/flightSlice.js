// store/flightSlice.js
import { createSlice } from '@reduxjs/toolkit';

const flightSlice = createSlice({
  name: 'flights',
  initialState: { activeFlights: [], selectedFlightId: null, loading: false, error: null, tracks: {} },
  reducers: {
    setActiveFlights: (s, a) => { s.activeFlights = a.payload; },
    upsertFlight: (s, a) => {
      const idx = s.activeFlights.findIndex(f => f.id === a.payload.id);
      if (idx !== -1) s.activeFlights[idx] = { ...s.activeFlights[idx], ...a.payload };
      else s.activeFlights.push(a.payload);
    },
    updatePosition: (s, a) => {
      const { callsign, lat, lon, altitude, speed, heading } = a.payload;
      const f = s.activeFlights.find(f => f.callsign === callsign);
      if (f) { f.position_lat = lat; f.position_lon = lon; f.altitude = altitude; f.ground_speed = speed; f.track_angle = heading; }
      // Maintain track history (last 20 points)
      if (!s.tracks[callsign]) s.tracks[callsign] = [];
      s.tracks[callsign] = [...s.tracks[callsign].slice(-19), { lat, lon, ts: Date.now() }];
    },
    selectFlight: (s, a) => { s.selectedFlightId = a.payload; },
    removeFlight: (s, a) => { s.activeFlights = s.activeFlights.filter(f => f.id !== a.payload); },
    setLoading: (s, a) => { s.loading = a.payload; },
    setError: (s, a) => { s.error = a.payload; },
  },
});
export const { setActiveFlights, upsertFlight, updatePosition, selectFlight, removeFlight, setLoading, setError } = flightSlice.actions;
export default flightSlice.reducer;
