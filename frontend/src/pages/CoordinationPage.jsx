// pages/CoordinationPage.jsx
import React, { useEffect, useState } from 'react';
import { coordinationAPI } from '../services/api';

const STATUS_COLOR = { PENDING: '#ffaa00', ACCEPTED: '#00aaff', TRANSFERRED: '#00ff88', REJECTED: '#ff4444', CANCELLED: '#888' };

export default function CoordinationPage() {
  const [handoffs, setHandoffs] = useState([]);
  const [sectors, setSectors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actioning, setActioning] = useState(null);

  const load = async () => {
    try {
      const [h, s] = await Promise.all([
        coordinationAPI.getHandoffs({ status: 'PENDING' }),
        coordinationAPI.getSectors(),
      ]);
      if (h.success) setHandoffs(h.data);
      if (s.success) setSectors(s.data);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { load(); const t = setInterval(load, 10000); return () => clearInterval(t); }, []);

  const accept = async (id) => { setActioning(id); await coordinationAPI.acceptHandoff(id); load(); setActioning(null); };
  const transfer = async (id) => { setActioning(id); await coordinationAPI.transferHandoff(id); load(); setActioning(null); };

  return (
    <div className="coord-page">
      <h2 className="page-title">🔄 Coordination</h2>

      <div className="coord-grid">
        {/* Pending Handoffs */}
        <div className="coord-card coord-wide">
          <h3>Pending Handoffs <span className="badge">{handoffs.length}</span></h3>
          {loading ? <div className="empty-state">Loading...</div> : (
            handoffs.length === 0
              ? <div className="empty-state">✅ No pending handoffs</div>
              : <table className="coord-table">
                  <thead>
                    <tr><th>Flight</th><th>From</th><th>To</th><th>Transfer Alt</th><th>Status</th><th>Actions</th></tr>
                  </thead>
                  <tbody>
                    {handoffs.map(h => (
                      <tr key={h.id}>
                        <td className="td-callsign">{h.flight_id}</td>
                        <td>{h.from_sector_id}</td>
                        <td>{h.to_sector_id}</td>
                        <td>{h.transfer_altitude ? `FL${Math.round(h.transfer_altitude/100)}` : '—'}</td>
                        <td><span className="status-chip" style={{ color: STATUS_COLOR[h.status] }}>{h.status}</span></td>
                        <td className="td-actions">
                          {h.status === 'PENDING' && (
                            <button className="coord-btn coord-accept" disabled={actioning === h.id} onClick={() => accept(h.id)}>ACCEPT</button>
                          )}
                          {h.status === 'ACCEPTED' && (
                            <button className="coord-btn coord-transfer" disabled={actioning === h.id} onClick={() => transfer(h.id)}>TRANSFER</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
          )}
        </div>

        {/* Sector Status */}
        <div className="coord-card coord-wide">
          <h3>Sector Status</h3>
          <div className="sector-grid">
            {sectors.map(s => (
              <div key={s.id} className={`sector-block sector-block-${s.type?.toLowerCase()}`}>
                <div className="sb-header">
                  <span className="sb-id">{s.id}</span>
                  <span className="sb-type">{s.type}</span>
                </div>
                <div className="sb-name">{s.name}</div>
                <div className="sb-controller">{s.controller_name || 'UNATTENDED'}</div>
                <div className="sb-flights">{s.active_flights || 0} aircraft</div>
                <div className="sb-alt">FL{Math.round((s.alt_lower||0)/100)} – FL{Math.round((s.alt_upper||0)/100)}</div>
              </div>
            ))}
            {sectors.length === 0 && <div className="empty-state">No sectors configured</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
