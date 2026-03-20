// pages/LoginPage.jsx
import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';

export default function LoginPage({ kc }) {
  const { isAuthenticated } = useSelector(s => s.auth);
  if (isAuthenticated) return <Navigate to="/cwp" replace />;

  return (
    <div className="login-page">
      <div className="login-bg" />
      <div className="login-card">
        <img src="/cwp/avionix-logo.png" alt="AVIONIX" className="login-logo" />
        <p className="login-sub">Air Traffic Control Management System</p>
        <div className="login-divider" />
        <button className="login-btn" onClick={() => kc.login()}>
          Login with Keycloak SSO
        </button>
        <p className="login-note">Access restricted to authorized ATC personnel</p>
      </div>
    </div>
  );
}
