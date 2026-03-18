// pages/LoginPage.jsx
import React from 'react';
import { useSelector } from 'react-redux';
import { Navigate } from 'react-router-dom';

export default function LoginPage({ kc }) {
  const { isAuthenticated } = useSelector(s => s.auth);
  if (isAuthenticated) return <Navigate to="/cwp" replace />;

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">✈</div>
        <h1 className="login-title">AVIONIX ATC</h1>
        <p className="login-sub">Air Traffic Control Management System</p>
        <button className="login-btn" onClick={() => kc.login()}>
          Login with Keycloak SSO
        </button>
        <p className="login-note">Access restricted to authorized ATC personnel</p>
      </div>
    </div>
  );
}
