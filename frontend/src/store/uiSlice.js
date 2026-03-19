import { createSlice } from '@reduxjs/toolkit';

const uiSlice = createSlice({
  name: 'ui',
  initialState: {
    activeView: 'cwp',
    radarMode: 'PLAN',
    zoom: 7,
    mapCenter: [14.5995, 120.9842],
    showWeatherOverlay: false,
    showTrajectories: true,
    showTracks: true,
    showSigmets: false,
    sidebarOpen: true,
    notifications: [],
    wsStatus: 'DISCONNECTED',
  },
  reducers: {
    setView:            (s, a) => { s.activeView = a.payload; },
    setRadarMode:       (s, a) => { s.radarMode = a.payload; },
    setZoom:            (s, a) => { s.zoom = a.payload; },
    setMapCenter:       (s, a) => { s.mapCenter = a.payload; },
    toggleWeather:      (s)    => { s.showWeatherOverlay = !s.showWeatherOverlay; },
    toggleTrajectories: (s)    => { s.showTrajectories = !s.showTrajectories; },
    toggleTracks:       (s)    => { s.showTracks = !s.showTracks; },
    toggleSidebar:      (s)    => { s.sidebarOpen = !s.sidebarOpen; },
    setWsStatus:        (s, a) => { s.wsStatus = a.payload; },
    addNotification:    (s, a) => {
      s.notifications.unshift({ ...a.payload, id: Date.now() });
      s.notifications = s.notifications.slice(0, 10);
    },
    removeNotification: (s, a) => {
      s.notifications = s.notifications.filter(n => n.id !== a.payload);
    },
  },
});

export const {
  setView, setRadarMode, setZoom, setMapCenter,
  toggleWeather, toggleTrajectories, toggleTracks, toggleSidebar,
  setWsStatus, addNotification, removeNotification,
} = uiSlice.actions;

export default uiSlice.reducer;
