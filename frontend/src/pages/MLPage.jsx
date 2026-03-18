// pages/MLPage.jsx
import React, { useEffect, useState } from 'react';
import { mlAPI } from '../services/api';

export default function MLPage() {
  const [airspaceRisk, setAirspaceRisk] = useState(null);
  const [forecast, setForecast] = useState(null);
  const [forecastAirport, setForecastAirport] = useState('RPLL');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const r = await mlAPI.assessAirspace();
        if (r.success) setAirspaceRisk(r.data);
      } catch {}
      setLoading(false);
    };
    load();
    const t = setInterval(load, 20000);
    return () => clearInterval(t);
  }, []);

  const loadForecast = async () => {
    try {
      const r = await mlAPI.forecastDemand(forecastAirport, 6);
      if (r.success) setForecast(r.data);
    } catch {}
  };

  const riskColor = (score) => score > 0.7 ? '#ff2200' : score > 0.4 ? '#ffaa00' : '#00ff88';

  return (
    <div className="ml-page">
      <h2 className="page-title">🧠 AI / Machine Learning</h2>

      <div className="ml-grid">
        {/* Airspace Risk Assessment */}
        <div className="ml-card ml-wide">
          <h3>Real-time Airspace Risk Assessment</h3>
          {loading ? <div className="empty-state">Running ML models...</div> : airspaceRisk ? (
            <>
              <div className="ml-summary">
                <div className="ml-stat"><div className="ml-val">{airspaceRisk.totalFlights}</div><div className="ml-lbl">Flights Assessed</div></div>
                <div className="ml-stat"><div className="ml-val">{airspaceRisk.pairsAssessed}</div><div className="ml-lbl">Pairs Evaluated</div></div>
                <div className="ml-stat"><div className="ml-val" style={{ color: airspaceRisk.highRiskPairs?.length > 0 ? '#ff2200' : '#00ff88' }}>{airspaceRisk.highRiskPairs?.length || 0}</div><div className="ml-lbl">High Risk Pairs</div></div>
                <div className="ml-stat"><div className="ml-val">{airspaceRisk.airspaceComplexity}%</div><div className="ml-lbl">Complexity Score</div></div>
              </div>

              {airspaceRisk.highRiskPairs?.length > 0 && (
                <div className="risk-pairs">
                  <h4>⚠️ High Risk Pairs</h4>
                  {airspaceRisk.highRiskPairs.map((p, i) => (
                    <div key={i} className="risk-pair-row">
                      <span className="rp-flights">{p.flight1} ↔ {p.flight2}</span>
                      <span className="rp-dist">{Number(p.hDist).toFixed(1)} NM H / {p.vDist} ft V</span>
                      <div className="rp-bar-wrap">
                        <div className="rp-bar" style={{ width: `${p.riskScore * 100}%`, background: riskColor(p.riskScore) }} />
                      </div>
                      <span className="rp-score" style={{ color: riskColor(p.riskScore) }}>{Math.round(p.riskScore * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}

              {airspaceRisk.allPairs?.length > 0 && (
                <div className="all-pairs">
                  <h4>All Proximity Pairs (top 20)</h4>
                  <table className="ml-table">
                    <thead><tr><th>Flight 1</th><th>Flight 2</th><th>H-Sep</th><th>V-Sep</th><th>Risk</th></tr></thead>
                    <tbody>
                      {airspaceRisk.allPairs.slice(0, 20).map((p, i) => (
                        <tr key={i}>
                          <td>{p.flight1}</td><td>{p.flight2}</td>
                          <td>{Number(p.hDist).toFixed(1)} NM</td>
                          <td>{p.vDist} ft</td>
                          <td style={{ color: riskColor(p.riskScore) }}>{Math.round(p.riskScore * 100)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : <div className="empty-state">No data</div>}
        </div>

        {/* Demand Forecast */}
        <div className="ml-card">
          <h3>Traffic Demand Forecast</h3>
          <div className="forecast-search">
            <input className="ml-input" value={forecastAirport} onChange={e => setForecastAirport(e.target.value.toUpperCase())} maxLength={4} />
            <button className="ml-btn" onClick={loadForecast}>FORECAST</button>
          </div>
          {forecast ? (
            <div className="forecast-results">
              <div className="forecast-airport">{forecast.airport} — Next {forecast.hoursAhead}h</div>
              {forecast.forecast.map((f, i) => (
                <div key={i} className="forecast-row">
                  <span className="fc-time">{new Date(f.time).toUTCString().slice(17, 22)}Z</span>
                  <div className="fc-bar-wrap">
                    <div className="fc-bar" style={{ width: `${Math.min(100, f.predicted * 8)}%` }} />
                  </div>
                  <span className="fc-val">{f.predicted} <span className="fc-range">({f.lowerBound}–{f.upperBound})</span></span>
                  <span className="fc-conf">{Math.round(f.confidence * 100)}%</span>
                </div>
              ))}
            </div>
          ) : <div className="empty-state">Enter airport ICAO and press FORECAST</div>}
        </div>

        {/* Models Info */}
        <div className="ml-card">
          <h3>Active ML Models</h3>
          <div className="models-list">
            {[
              { name: 'Conflict Predictor', version: 'v2.1', type: 'Logistic Regression', status: 'ACTIVE' },
              { name: 'Trajectory LSTM', version: 'v2.0', type: 'Kinematic + Wind', status: 'ACTIVE' },
              { name: 'Anomaly Detector', version: 'v1.3', type: 'Isolation Forest', status: 'ACTIVE' },
              { name: 'Demand Forecaster', version: 'v1.5', type: 'XGBoost TimeSeries', status: 'ACTIVE' },
              { name: 'Weather Hazard', version: 'v1.2', type: 'Gradient Boosting', status: 'ACTIVE' },
              { name: 'Runway Incursion', version: 'v1.0', type: 'Feature-weighted', status: 'ACTIVE' },
            ].map((m, i) => (
              <div key={i} className="model-row">
                <div className="model-top">
                  <span className="model-name">{m.name}</span>
                  <span className="model-ver">{m.version}</span>
                  <span className="model-status">● {m.status}</span>
                </div>
                <div className="model-type">{m.type}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
