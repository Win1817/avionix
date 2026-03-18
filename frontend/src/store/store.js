// store/store.js
import { configureStore } from '@reduxjs/toolkit';
import flightReducer from './flightSlice';
import alertReducer from './alertSlice';
import authReducer from './authSlice';
import uiReducer from './uiSlice';
import weatherReducer from './weatherSlice';
import analyticsReducer from './analyticsSlice';

export const store = configureStore({
  reducer: {
    flights: flightReducer,
    alerts: alertReducer,
    auth: authReducer,
    ui: uiReducer,
    weather: weatherReducer,
    analytics: analyticsReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
});

export default store;
