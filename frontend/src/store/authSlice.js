// store/authSlice.js
import { createSlice } from '@reduxjs/toolkit';
const authSlice = createSlice({
  name: 'auth',
  initialState: { user: null, token: null, roles: [], sector: null, isAuthenticated: false },
  reducers: {
    setAuth: (s, a) => { Object.assign(s, a.payload, { isAuthenticated: true }); },
    setToken: (s, a) => { s.token = a.payload; },
    clearAuth: (s) => { s.user = null; s.token = null; s.roles = []; s.isAuthenticated = false; },
    setSector: (s, a) => { s.sector = a.payload; },
  },
});
export const { setAuth, setToken, clearAuth, setSector } = authSlice.actions;
export default authSlice.reducer;
