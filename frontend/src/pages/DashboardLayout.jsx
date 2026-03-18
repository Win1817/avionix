// pages/DashboardLayout.jsx
import React, { useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { clearAuth } from '../store/authSlice';
import { toggleSidebar, removeNotification } from '../store/uiSlice';
import { analyticsAPI } from '../services/api';
import { setKpis } from '../store/uiSlice';

export default function DashboardLayout({ kc }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { user, roles } = useSelector(s => s.auth);
  const { sidebarOpen, wsStatus, notifications } = useSelector(s => s.ui);
  const alerts = useSelector(s => s.alerts.activeAlerts);
  const flights = useSelector(s => s.flights.activeFlights);

  const criticalCount = alerts.filter(a => a.severity === 'CRITICAL').length;

  const handleLogout = () => {
    dispatch(clearAuth());
    kc.logout({ redirectUri: window.location.origin + '/login' });
  };

  const navItems = [
    { to: '/cwp',          icon: '🎛️',  label: 'CWP',          roles: ['ATC_CONTROLLER','ATC_SUPERVISOR','ATC_TRAINEE'] },
    { to: '/coordination', icon: '🔄',  label: 'Coordination', roles: ['ATC_CONTROLLER','ATC_SUPERVISOR'] },
    { to: '/weather',      icon: '🌩️',  label: 'Weather',      roles: [] },
    { to: '/analytics',    icon: '📊',  label: 'Analytics',    roles: ['ATC_SUPERVISOR','OPERATIONS_MANAGER','DATA_ANALYST'] },
    { to: '/ml',           icon: '🧠',  label: 'AI / ML',      roles: ['ATC_SUPERVISOR','SUPER_ADMIN'] },
  ];

  const hasAccess = (requiredRoles) => requiredRoles.length === 0 || requiredRoles.some(r => roles.includes(r)) || roles.includes('SUPER_ADMIN');

  return (
    <div className="layout">
      {/* Top Bar */}
      <header className="topbar">
        <div className="topbar-left">
          <button className="btn-icon" onClick={() => dispatch(toggleSidebar())}>☰</button>
          <span className="brand">✈ AVIONIX ATC</span>
          <div className={`ws-badge ws-${wsStatus.toLowerCase()}`}>{wsStatus}</div>
        </div>
        <div className="topbar-center">
          <span className="kpi-chip">✈ {flights.length} Active</span>
          {criticalCount > 0 && <span className="kpi-chip kpi-critical blink">🚨 {criticalCount} CRITICAL</span>}
        </div>
        <div className="topbar-right">
          <span className="user-info">{user?.username} · {roles[0]}</span>
          <button className="btn-logout" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div className="layout-body">
        {/* Sidebar */}
        <nav className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
          {navItems.filter(n => hasAccess(n.roles)).map(n => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
              <span className="nav-icon">{n.icon}</span>
              {sidebarOpen && <span className="nav-label">{n.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Main content */}
        <main className="main-content">
          {/* Notification stack */}
          <div className="notif-stack">
            {notifications.slice(0, 4).map(n => (
              <div key={n.id} className={`notif notif-${n.type} notif-${n.severity?.toLowerCase()}`}>
                <span>{n.message}</span>
                <button onClick={() => dispatch(removeNotification(n.id))}>✕</button>
              </div>
            ))}
          </div>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
