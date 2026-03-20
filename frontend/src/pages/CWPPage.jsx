// pages/CWPPage.jsx — Controller Working Position
import React, { useEffect, useCallback, useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { setActiveFlights, selectFlight } from '../store/flightSlice';
import { setAlerts } from '../store/alertSlice';
import { flightAPI, alertAPI } from '../services/api';
import RadarScope from '../components/CWP/RadarScope';
import FlightStrips from '../components/CWP/FlightStrips';
import AlertsPanel from '../components/CWP/AlertsPanel';
import FlightDetail from '../components/CWP/FlightDetail';

// Normalise API response — handles both:
//   { success: true, data: [...] }            (plain array)
//   { success: true, data: { content: [...] } } (Spring Page)
function extractList(res) {
  if (!res || !res.success) return null;
  const d = res.data;
  if (Array.isArray(d)) return d;
  if (d && Array.isArray(d.content)) return d.content;
  return [];
}

export default function CWPPage() {
  const dispatch = useDispatch();
  const flights  = useSelector(s => s.flights.activeFlights);
  const tracks   = useSelector(s => s.flights.tracks);
  const alerts   = useSelector(s => s.alerts.activeAlerts);
  const selectedId = useSelector(s => s.flights.selectedFlightId);
  const { showTrajectories, showTracks } = useSelector(s => s.ui);
  const [trajectories, setTrajectories] = useState({});
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [flightsRes, alertsRes] = await Promise.all([
        flightAPI.getFlights({ status: 'ACTIVE' }),
        alertAPI.getAlerts({ limit: 50 }),
      ]);
      const flightList = extractList(flightsRes);
      const alertList  = extractList(alertsRes);
      if (flightList !== null) dispatch(setActiveFlights(flightList));
      if (alertList  !== null) dispatch(setAlerts(alertList));
    } catch (e) {
      console.error('CWP load error', e);
    } finally {
      setLoading(false);
    }
  }, [dispatch]);

  useEffect(() => {
    loadData();
    const t = setInterval(loadData, 15000);
    return () => clearInterval(t);
  }, [loadData]);

  // Load trajectory for selected flight
  useEffect(() => {
    if (!selectedId) return;
    flightAPI.getTrajectory(selectedId)
      .then(r => {
        if (r?.success) {
          setTrajectories(t => ({ ...t, [selectedId]: r.data?.trajectory_points }));
        }
      })
      .catch(() => {});
  }, [selectedId]);

  const selectedFlight = Array.isArray(flights)
    ? flights.find(f => f.id === selectedId)
    : null;

  if (loading) return <div className="loading-screen">Loading airspace picture...</div>;

  return (
    <div className="cwp-layout">
      <aside className="cwp-strips">
        <FlightStrips
          flights={flights}
          alerts={alerts}
          selectedId={selectedId}
          onSelect={(id) => dispatch(selectFlight(id))}
        />
      </aside>

      <section className="cwp-radar">
        <RadarScope
          flights={flights}
          tracks={tracks}
          alerts={alerts}
          selectedId={selectedId}
          trajectories={trajectories}
          showTrajectories={showTrajectories}
          showTracks={showTracks}
          onFlightClick={(id) => dispatch(selectFlight(id))}
        />
      </section>

      <aside className="cwp-right">
        <AlertsPanel
          alerts={alerts}
          flights={flights}
          onAlertClick={(a) => dispatch(selectFlight(a.flight_id_primary))}
          onDismiss={async (id) => {
            await alertAPI.dismissAlert(id, 'CONTROLLER_DISMISSED');
            loadData();
          }}
        />
        {selectedFlight && (
          <FlightDetail flight={selectedFlight} onRefresh={loadData} />
        )}
      </aside>
    </div>
  );
}
