// components/CWP/FlightStrips.jsx
import React, { useState } from 'react';

const SEVERITY_COLOR = { CRITICAL: '#ff0000', HIGH: '#ff6600', MEDIUM: '#ffaa00', LOW: '#ffff00' };

export default function FlightStrips({ flights, alerts, selectedId, onSelect }) {
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState('callsign');

  const getAlertColor = (callsign) => {
    const a = alerts.find(al => al.callsign_primary === callsign || al.callsign_secondary === callsign);
    return a ? SEVERITY_COLOR[a.severity] : null;
  };

  const filtered = flights
    .filter(f => !filter || f.callsign?.toLowerCase().includes(filter.toLowerCase())
      || f.departure_airport?.includes(filter.toUpperCase())
      || f.destination_airport?.includes(filter.toUpperCase()))
    .sort((a, b) => {
      if (sort === 'callsign') return a.callsign?.localeCompare(b.callsign);
      if (sort === 'altitude') return (b.altitude || 0) - (a.altitude || 0);
      if (sort === 'speed') return (b.ground_speed || 0) - (a.ground_speed || 0);
      return 0;
    });

  return (
    <div className="strips-panel">
      <div className="strips-header">
        <span>FLIGHTS <span className="strip-count">{flights.length}</span></span>
      </div>
      <div className="strips-controls">
        <input
          className="strip-search"
          placeholder="Filter..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
        />
        <select className="strip-sort" value={sort} onChange={e => setSort(e.target.value)}>
          <option value="callsign">Callsign</option>
          <option value="altitude">Altitude</option>
          <option value="speed">Speed</option>
        </select>
      </div>
      <div className="strips-list">
        {filtered.map(f => {
          const alertColor = getAlertColor(f.callsign);
          const isSelected = f.id === selectedId;
          return (
            <div
              key={f.id}
              className={`strip ${isSelected ? 'strip-selected' : ''}`}
              style={alertColor ? { borderLeft: `4px solid ${alertColor}` } : {}}
              onClick={() => onSelect(f.id)}
            >
              <div className="strip-row1">
                <span className="strip-callsign">{f.callsign}</span>
                <span className="strip-type">{f.aircraft_type}</span>
                {alertColor && <span className="strip-alert-dot" style={{ background: alertColor }} />}
              </div>
              <div className="strip-row2">
                <span className="strip-route">{f.departure_airport}→{f.destination_airport}</span>
                <span className="strip-fl">FL{f.altitude ? String(Math.round(f.altitude / 100)).padStart(3, '0') : '---'}</span>
              </div>
              <div className="strip-row3">
                <span className="strip-spd">{f.ground_speed ? `${f.ground_speed}kt` : '---'}</span>
                <span className={`strip-status strip-status-${f.status?.toLowerCase()}`}>{f.status}</span>
                <span className="strip-sector">{f.sector_id || '—'}</span>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="strips-empty">No flights</div>}
      </div>
    </div>
  );
}
