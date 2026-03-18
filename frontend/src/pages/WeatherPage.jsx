// pages/WeatherPage.jsx
import React, { useEffect, useState } from 'react';
import { weatherAPI } from '../services/api';

const PHENOM_COLOR = { TS: '#ff4400', TURB: '#ffaa00', ICE: '#00aaff', VA: '#aa44ff', TC: '#ff0088', MTW: '#ff6600' };

export default function WeatherPage() {
  const [sigmets, setSigmets] = useState([]);
  const [metarIcao, setMetarIcao] = useState('RPLL');
  const [metar, setMetar] = useState(null);
  const [pireps, setPireps] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const s = await weatherAPI.getSigmets();
        if (s.success) setSigmets(s.data);
      } catch {}
      setLoading(false);
    };
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);

  const fetchMetar = async () => {
    try {
      const r = await weatherAPI.getMetar(metarIcao);
      if (r.success) setMetar(r.data);
    } catch { setMetar(null); }
  };

  return (
    <div className="weather-page">
      <h2 className="page-title">🌩️ Weather Services</h2>

      <div className="weather-grid">
        {/* SIGMETs */}
        <div className="wx-card wx-wide">
          <h3>Active SIGMETs</h3>
          {loading ? <div className="empty-state">Loading...</div> : (
            sigmets.length === 0
              ? <div className="empty-state">✅ No active SIGMETs</div>
              : sigmets.map(s => (
                <div key={s.id} className="sigmet-item" style={{ borderLeft: `4px solid ${PHENOM_COLOR[s.phenomenon] || '#888'}` }}>
                  <div className="sigmet-top">
                    <span className="sigmet-phenom" style={{ color: PHENOM_COLOR[s.phenomenon] || '#fff' }}>{s.phenomenon}</span>
                    <span className="sigmet-fir">FIR: {s.fir}</span>
                    <span className="sigmet-levels">FL{Math.round((s.level_lower||0)/100)}–FL{Math.round((s.level_upper||0)/100)}</span>
                    <span className="sigmet-valid">Valid: {new Date(s.valid_to).toUTCString().slice(17, 22)}Z</span>
                  </div>
                  <div className="sigmet-raw">{s.raw_text}</div>
                </div>
              ))
          )}
        </div>

        {/* METAR Lookup */}
        <div className="wx-card">
          <h3>METAR</h3>
          <div className="metar-search">
            <input className="wx-input" value={metarIcao} onChange={e => setMetarIcao(e.target.value.toUpperCase())} maxLength={4} />
            <button className="wx-btn" onClick={fetchMetar}>GET</button>
          </div>
          {metar ? (
            <div className="metar-display">
              <div className="metar-station">{metar.station_icao}</div>
              <div className="metar-raw">{metar.raw_text}</div>
              <div className="metar-parsed">
                <div className="metar-row"><label>Wind</label><span>{metar.wind_direction}° / {metar.wind_speed_kt}kt{metar.wind_gust_kt ? ` G${metar.wind_gust_kt}` : ''}</span></div>
                <div className="metar-row"><label>Vis</label><span>{metar.visibility_sm} SM</span></div>
                <div className="metar-row"><label>Ceiling</label><span>{metar.ceiling_ft ? `${metar.ceiling_ft} ft` : 'CAVOK'}</span></div>
                <div className="metar-row"><label>Temp/Dew</label><span>{metar.temperature_c}°C / {metar.dewpoint_c}°C</span></div>
                <div className="metar-row"><label>QNH</label><span>{metar.altimeter_inhg} inHg</span></div>
                <div className="metar-row"><label>Observed</label><span>{new Date(metar.observation_time).toUTCString().slice(5, 22)}Z</span></div>
              </div>
            </div>
          ) : (
            <div className="empty-state">Enter ICAO and press GET</div>
          )}
        </div>

        {/* Hazard Prediction */}
        <div className="wx-card">
          <h3>🧠 ML Hazard Prediction</h3>
          <div className="hazard-info">
            <p>Enter position to predict weather hazards using ML fusion of SIGMET + PIREP data.</p>
            <div className="hazard-legend">
              {Object.entries(PHENOM_COLOR).map(([k, v]) => (
                <span key={k} className="hazard-chip" style={{ borderColor: v, color: v }}>{k}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
