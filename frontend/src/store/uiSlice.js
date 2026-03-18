// store/uiSlice.js
import { createSlice } from '@reduxjs/toolkit';
export const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    activeView: 'cwp', // cwp | analytics | weather | coordination | ml
    radarMode: 'PLAN', // PLAN | RADAR | COMBINED
    zoom: 7,
    mapCenter: [14.5995, 120.9842], // Manila FIR default
    showWeatherOverlay: false,
    showTrajectories: true,
    showTracks: true,
    showSigmets: false,
    sidebarOpen: true,
    notifications: [],
    wsStatus: 'DISCONNECTED',
  },
  reducers: {
    setView: (s, a) => { s.activeView = a.payload; },
    setRadarMode: (s, a) => { s.radarMode = a.payload; },
    setZoom: (s, a) => { s.zoom = a.payload; },
    setMapCenter: (s, a) => { s.mapCenter = a.payload; },
    toggleWeather: (s) => { s.showWeatherOverlay = !s.showWeatherOverlay; },
    toggleTrajectories: (s) => { s.showTrajectories = !s.showTrajectories; },
    toggleTracks: (s) => { s.showTracks = !s.showTracks; },
    toggleSidebar: (s) => { s.sidebarOpen = !s.sidebarOpen; },
    setWsStatus: (s, a) => { s.wsStatus = a.payload; },
    addNotification: (s, a) => { s.notifications.unshift({ ...a.payload, id: Date.now() }); s.notifications = s.notifications.slice(0, 10); },
    removeNotification: (s, a) => { s.notifications = s.notifications.filter(n => n.id !== a.payload); },
  },
});
export const { setView, setRadarMode, setZoom, setMapCenter, toggleWeather, toggleTrajectories,
  toggleTracks, toggleSidebar, setWsStatus, addNotification, removeNotification } = uiSlice.actions;
export default uiSlice.reducer;

// store/weatherSlice.js
import { createSlice as cs2 } from '@reduxjs/toolkit';
export const weatherSlice = cs2({
  name: 'weather',
  initialState: { sigmets: [], metars: {}, pireps: [], hazards: [] },
  reducers: {
    setSigmets: (s, a) => { s.sigmets = a.payload; },
    setMetar: (s, a) => { s.metars[a.payload.station_icao] = a.payload; },
    setPireps: (s, a) => { s.pireps = a.payload; },
    setHazards: (s, a) => { s.hazards = a.payload; },
  },
});
export const { setSigmets, setMetar, setPireps, setHazards } = weatherSlice.actions;
const weatherReducer = weatherSlice.reducer;
export default weatherReducer;

// store/analyticsSlice.js
import { createSlice as cs3 } from '@reduxjs/toolkit';
export const analyticsSlice = cs3({
  name: 'analytics',
  initialState: { kpis: null, sectorMetrics: [], safetyTrends: [], workload: [], trafficFlow: [] },
  reducers: {
    setKpis: (s, a) => { s.kpis = a.payload; },
    setSectorMetrics: (s, a) => { s.sectorMetrics = a.payload; },
    setSafetyTrends: (s, a) => { s.safetyTrends = a.payload; },
    setWorkload: (s, a) => { s.workload = a.payload; },
    setTrafficFlow: (s, a) => { s.trafficFlow = a.payload; },
  },
});
export const { setKpis, setSectorMetrics, setSafetyTrends, setWorkload, setTrafficFlow } = analyticsSlice.actions;
const analyticsReducer = analyticsSlice.reducer;
export default analyticsReducer;
