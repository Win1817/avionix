// src/App.jsx
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import Keycloak from 'keycloak-js';
import { setAuth, setToken, clearAuth } from './store/authSlice';
import { connectWS, disconnectWS } from './services/websocket';
import LoginPage from './pages/LoginPage';
import DashboardLayout from './pages/DashboardLayout';
import CWPPage from './pages/CWPPage';
import AnalyticsPage from './pages/AnalyticsPage';
import WeatherPage from './pages/WeatherPage';
import CoordinationPage from './pages/CoordinationPage';
import MLPage from './pages/MLPage';
import './styles/App.css';

const kc = new Keycloak({
  url: import.meta.env.VITE_KEYCLOAK_URL || 'http://localhost:8080',
  realm: import.meta.env.VITE_KEYCLOAK_REALM || 'avionix',
  clientId: import.meta.env.VITE_KEYCLOAK_CLIENT_ID || 'avionix-frontend',
});

const ProtectedRoute = ({ children }) => {
  const { isAuthenticated } = useSelector(s => s.auth);
  return isAuthenticated ? children : <Navigate to="/login" replace />;
};

export default function App() {
  const dispatch = useDispatch();
  const [kcReady, setKcReady] = useState(false);

  useEffect(() => {
    kc.init({ onLoad: 'check-sso', silentCheckSsoRedirectUri: `${window.location.origin}/cwp/silent-check-sso.html` })
      .then((authenticated) => {
        if (authenticated) {
          const roles = kc.tokenParsed?.realm_access?.roles || [];
          dispatch(setAuth({
            user: { id: kc.subject, username: kc.tokenParsed?.preferred_username, name: kc.tokenParsed?.name, email: kc.tokenParsed?.email },
            token: kc.token, roles,
            sector: kc.tokenParsed?.sector || null,
          }));
          dispatch(setToken(kc.token));
          connectWS(kc.token);

          // Token refresh every 4 minutes
          setInterval(() => {
            kc.updateToken(60).then((refreshed) => {
              if (refreshed) dispatch(setToken(kc.token));
            }).catch(() => dispatch(clearAuth()));
          }, 240000);
        }
        setKcReady(true);
      })
      .catch(() => setKcReady(true));

    return () => disconnectWS();
  }, [dispatch]);

  if (!kcReady) {
    return (
      <div className="splash">
        <img src="/avionix-logo.png" alt="AVIONIX" className="splash-logo" />
        <div className="splash-bar"><div className="splash-bar-fill" /></div>
        <div className="splash-sub">Initializing system...</div>
      </div>
    );
  }

  return (
    <BrowserRouter basename="/cwp">
      <Routes>
        <Route path="/login" element={<LoginPage kc={kc} />} />
        <Route path="/" element={<ProtectedRoute><DashboardLayout kc={kc} /></ProtectedRoute>}>
          <Route index element={<Navigate to="/cwp" replace />} />
          <Route path="cwp" element={<CWPPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="weather" element={<WeatherPage />} />
          <Route path="coordination" element={<CoordinationPage />} />
          <Route path="ml" element={<MLPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/cwp" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
