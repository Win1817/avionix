// components/CWP/FlightDetail.jsx
import React, { useState } from 'react';
import { coordinationAPI, alertAPI } from '../../services/api';

export default function FlightDetail({ flight, onRefresh }) {
  const [tab, setTab] = useState('info');
  const [clearanceForm, setClearanceForm] = useState({ type: 'ALTITUDE', instruction: '' });
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState('');

  const issueClearance = async () => {
    setSending(true);
    try {
      await coordinationAPI.issueClearance({ flight_id: flight.id, ...clearanceForm });
      setMsg('✅ Clearance issued');
      onRefresh();
    } catch { setMsg('❌ Failed'); }
    setSending(false);
    setTimeout(() => setMsg(''), 3000);
  };

  return (
    <div className="flight-detail">
      <div className="fd-header">
        <span className="fd-callsign">{flight.callsign}</span>
        <span className="fd-type">{flight.aircraft_type}</span>
        <span className={`fd-status fd-status-${flight.status?.toLowerCase()}`}>{flight.status}</span>
      </div>

      <div className="fd-tabs">
        {['info','clearance','route'].map(t => (
          <button key={t} className={`fd-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t.toUpperCase()}
          </button>
        ))}
      </div>

      {tab === 'info' && (
        <div className="fd-body">
          <div className="fd-row"><label>Route</label><span>{flight.departure_airport} → {flight.destination_airport}</span></div>
          <div className="fd-row"><label>Altitude</label><span>FL{flight.altitude ? String(Math.round(flight.altitude/100)).padStart(3,'0') : '---'} / CFL{String(Math.round((flight.cruise_altitude||0)/100)).padStart(3,'0')}</span></div>
          <div className="fd-row"><label>Speed</label><span>{flight.ground_speed || '---'} kt</span></div>
          <div className="fd-row"><label>Heading</label><span>{flight.track_angle != null ? `${Math.round(flight.track_angle)}°` : '---'}</span></div>
          <div className="fd-row"><label>Sector</label><span>{flight.sector_id || 'Unassigned'}</span></div>
          <div className="fd-row"><label>Operator</label><span>{flight.operator_icao || '---'}</span></div>
          {flight.active_alerts > 0 && <div className="fd-row fd-alert-row"><label>Alerts</label><span className="fd-alert-count">{flight.active_alerts} active</span></div>}
        </div>
      )}

      {tab === 'clearance' && (
        <div className="fd-body">
          <select className="fd-input" value={clearanceForm.type} onChange={e => setClearanceForm(f => ({...f, type: e.target.value}))}>
            {['ALTITUDE','ROUTE','SPEED','APPROACH','DEPARTURE'].map(t => <option key={t}>{t}</option>)}
          </select>
          <input className="fd-input" placeholder="Instruction..." value={clearanceForm.instruction}
            onChange={e => setClearanceForm(f => ({...f, instruction: e.target.value}))} />
          <button className="fd-btn" disabled={sending || !clearanceForm.instruction} onClick={issueClearance}>
            {sending ? 'Sending...' : 'Issue Clearance'}
          </button>
          {msg && <div className="fd-msg">{msg}</div>}
        </div>
      )}

      {tab === 'route' && (
        <div className="fd-body">
          <div className="fd-route-text">{flight.route || 'Route not filed'}</div>
          {flight.waypoints && <pre className="fd-waypoints">{JSON.stringify(JSON.parse(flight.waypoints||'[]'), null, 2)}</pre>}
        </div>
      )}
    </div>
  );
}
