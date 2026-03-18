// components/CWP/AlertsPanel.jsx
import React from 'react';

const SEV = { CRITICAL: { color: '#ff0000', bg: '#2a0000', label: '🚨 CRITICAL' },
              HIGH:     { color: '#ff6600', bg: '#2a1200', label: '⚠️ HIGH' },
              MEDIUM:   { color: '#ffaa00', bg: '#2a1f00', label: '⚡ MEDIUM' },
              LOW:      { color: '#ffff00', bg: '#1f1f00', label: '📋 LOW' } };

export default function AlertsPanel({ alerts, flights, onAlertClick, onDismiss }) {
  const sorted = [...alerts].sort((a, b) => {
    const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    return (order[a.severity] ?? 4) - (order[b.severity] ?? 4);
  });

  return (
    <div className="alerts-panel">
      <div className="alerts-header">
        <span>ALERTS <span className="alert-count">{alerts.length}</span></span>
        {alerts.some(a => a.severity === 'CRITICAL') && <span className="blink alert-critical-label">● CRITICAL</span>}
      </div>
      <div className="alerts-list">
        {sorted.map(alert => {
          const s = SEV[alert.severity] || SEV.LOW;
          return (
            <div
              key={alert.id}
              className={`alert-item ${alert.severity === 'CRITICAL' ? 'alert-flash' : ''}`}
              style={{ borderColor: s.color, background: s.bg }}
              onClick={() => onAlertClick(alert)}
            >
              <div className="alert-top">
                <span className="alert-type">{alert.alert_type}</span>
                <span className="alert-sev" style={{ color: s.color }}>{s.label}</span>
              </div>
              <div className="alert-callsigns">
                {alert.callsign_primary}
                {alert.callsign_secondary && <> ↔ {alert.callsign_secondary}</>}
              </div>
              {alert.horizontal_distance && (
                <div className="alert-sep">
                  H: {Number(alert.horizontal_distance).toFixed(1)}NM  V: {alert.vertical_distance}ft
                  {alert.time_to_collision && <> TTC: {Math.round(alert.time_to_collision)}s</>}
                </div>
              )}
              <div className="alert-desc">{alert.alert_description}</div>
              <button className="alert-dismiss" onClick={e => { e.stopPropagation(); onDismiss(alert.id); }}>
                ACK
              </button>
            </div>
          );
        })}
        {sorted.length === 0 && <div className="alerts-empty">✅ No active alerts</div>}
      </div>
    </div>
  );
}
