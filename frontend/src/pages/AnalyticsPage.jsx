// pages/AnalyticsPage.jsx
import React, { useEffect, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { analyticsAPI } from '../services/api';

const SCOLORS = { CRITICAL: '#ff2200', HIGH: '#ff6600', MEDIUM: '#ffaa00', LOW: '#44ff88' };

export default function AnalyticsPage() {
  const [kpis, setKpis] = useState(null);
  const [sectors, setSectors] = useState([]);
  const [trends, setTrends] = useState([]);
  const [workload, setWorkload] = useState([]);
  const [flow, setFlow] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const [k, s, t, w, f] = await Promise.all([
          analyticsAPI.getKpis(),
          analyticsAPI.getSectorMetrics(),
          analyticsAPI.getSafetyTrends(7),
          analyticsAPI.getControllerWorkload(),
          analyticsAPI.getTrafficFlow({ hours: 12 }),
        ]);
        if (k.success) setKpis(k.data);
        if (s.success) setSectors(s.data);
        if (t.success) setTrends(t.data);
        if (w.success) setWorkload(w.data);
        if (f.success) setFlow(f.data);
      } catch (e) { console.error(e); }
      setLoading(false);
    };
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  if (loading) return <div className="loading-screen">Loading analytics...</div>;

  const trendChartData = Object.values(
    trends.reduce((acc, t) => {
      const d = t.date?.split('T')[0];
      if (!acc[d]) acc[d] = { date: d, CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
      acc[d][t.severity] = (acc[d][t.severity] || 0) + Number(t.count);
      return acc;
    }, {})
  ).slice(-7);

  const workloadColors = { HIGH: '#ff4444', MEDIUM: '#ffaa00', LOW: '#44ff88' };

  return (
    <div className="analytics-page">
      <h2 className="page-title">📊 Analytics Dashboard</h2>

      {/* KPI Row */}
      {kpis && (
        <div className="kpi-row">
          <div className="kpi-card"><div className="kpi-val">{kpis.flights?.active || 0}</div><div className="kpi-label">Active Flights</div></div>
          <div className="kpi-card"><div className="kpi-val">{kpis.flights?.today || 0}</div><div className="kpi-label">Flights Today</div></div>
          <div className="kpi-card kpi-warn"><div className="kpi-val">{kpis.alerts?.active || 0}</div><div className="kpi-label">Active Alerts</div></div>
          <div className="kpi-card kpi-danger"><div className="kpi-val">{kpis.alerts?.critical_today || 0}</div><div className="kpi-label">Critical Today</div></div>
          <div className="kpi-card"><div className="kpi-val">{Number(kpis.separation?.avg_horizontal_nm || 0).toFixed(1)} NM</div><div className="kpi-label">Avg H-Sep</div></div>
          <div className="kpi-card kpi-danger"><div className="kpi-val">{kpis.separation?.violations_today || 0}</div><div className="kpi-label">Sep Violations Today</div></div>
        </div>
      )}

      <div className="analytics-grid">
        {/* Safety Trends */}
        <div className="chart-card chart-wide">
          <h3>Safety Alert Trends (7 days)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={trendChartData}>
              <XAxis dataKey="date" tick={{ fill: '#aaa', fontSize: 11 }} />
              <YAxis tick={{ fill: '#aaa', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0a0f1e', border: '1px solid #0f3d22', color: '#0f0' }} />
              <Legend />
              {['CRITICAL','HIGH','MEDIUM','LOW'].map(s => (
                <Bar key={s} dataKey={s} stackId="a" fill={SCOLORS[s]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Traffic Flow */}
        <div className="chart-card chart-wide">
          <h3>Traffic Flow (12h)</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={flow.slice(0, 24).reverse()}>
              <XAxis dataKey="time_bucket" tickFormatter={v => v ? new Date(v).getHours() + 'h' : ''} tick={{ fill: '#aaa', fontSize: 11 }} />
              <YAxis tick={{ fill: '#aaa', fontSize: 11 }} />
              <Tooltip contentStyle={{ background: '#0a0f1e', border: '1px solid #0f3d22', color: '#0f0' }} />
              <Line type="monotone" dataKey="departures" stroke="#00ff88" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Sector Metrics */}
        <div className="chart-card">
          <h3>Sector Loads</h3>
          <div className="sector-list">
            {sectors.map(s => (
              <div key={s.sector_id} className="sector-row">
                <span className="sector-name">{s.sector_name || s.sector_id}</span>
                <div className="sector-bar-wrap">
                  <div className="sector-bar" style={{
                    width: `${Math.min(100, (s.active_flights / 15) * 100)}%`,
                    background: workloadColors[s.workloadLevel] || '#44ff88'
                  }} />
                </div>
                <span className="sector-flights">{s.active_flights} ac</span>
                <span className={`sector-wl sector-wl-${s.workloadLevel?.toLowerCase()}`}>{s.workloadLevel}</span>
              </div>
            ))}
            {sectors.length === 0 && <div className="empty-state">No sector data</div>}
          </div>
        </div>

        {/* Controller Workload */}
        <div className="chart-card">
          <h3>Controller Workload</h3>
          <div className="workload-list">
            {workload.map(c => (
              <div key={c.id} className="workload-row">
                <div className="wl-top">
                  <span className="wl-name">{c.name}</span>
                  <span className={`wl-level wl-${c.workloadLevel?.toLowerCase()}`}>{c.workloadLevel}</span>
                </div>
                <div className="wl-bar-wrap">
                  <div className="wl-bar" style={{ width: `${c.workloadScore}%`, background: workloadColors[c.workloadLevel] || '#44ff88' }} />
                </div>
                <div className="wl-stats">{c.active_flights} flights · {c.active_alerts} alerts · {c.pending_handoffs} handoffs</div>
                <div className="wl-rec">{c.recommendation}</div>
              </div>
            ))}
            {workload.length === 0 && <div className="empty-state">No controller data</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
