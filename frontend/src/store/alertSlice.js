// store/alertSlice.js
import { createSlice } from '@reduxjs/toolkit';
const alertSlice = createSlice({
  name: 'alerts',
  initialState: { activeAlerts: [], history: [] },
  reducers: {
    setAlerts: (s, a) => { s.activeAlerts = a.payload; },
    addAlert: (s, a) => {
      const exists = s.activeAlerts.find(al => al.id === a.payload.id);
      if (!exists) s.activeAlerts.unshift(a.payload);
    },
    dismissAlert: (s, a) => {
      s.history.push(s.activeAlerts.find(al => al.id === a.payload));
      s.activeAlerts = s.activeAlerts.filter(al => al.id !== a.payload);
    },
  },
});
export const { setAlerts, addAlert, dismissAlert } = alertSlice.actions;
export default alertSlice.reducer;
