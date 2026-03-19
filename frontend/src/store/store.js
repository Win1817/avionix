import { configureStore } from '@reduxjs/toolkit';
import flightReducer    from './flightSlice.js';
import alertReducer     from './alertSlice.js';
import authReducer      from './authSlice.js';
import uiReducer        from './uiSlice.js';
import weatherReducer   from './weatherSlice.js';
import analyticsReducer from './analyticsSlice.js';

export const store = configureStore({
  reducer: {
    flights:   flightReducer,
    alerts:    alertReducer,
    auth:      authReducer,
    ui:        uiReducer,
    weather:   weatherReducer,
    analytics: analyticsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
});

export default store;
