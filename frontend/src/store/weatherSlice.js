import { createSlice } from '@reduxjs/toolkit';

const weatherSlice = createSlice({
  name: 'weather',
  initialState: { sigmets: [], metars: {}, pireps: [], hazards: [] },
  reducers: {
    setSigmets: (s, a) => { s.sigmets = a.payload; },
    setMetar:   (s, a) => { s.metars[a.payload.station_icao] = a.payload; },
    setPireps:  (s, a) => { s.pireps = a.payload; },
    setHazards: (s, a) => { s.hazards = a.payload; },
  },
});

export const { setSigmets, setMetar, setPireps, setHazards } = weatherSlice.actions;
export default weatherSlice.reducer;
