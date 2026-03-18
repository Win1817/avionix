// components/CWP/RadarScope.jsx
// Canvas-based radar display with aircraft targets, tracks, labels, trajectory lines

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useSelector } from 'react-redux';

const COLORS = {
  bg: '#0a0f1e',
  grid: '#0d2a1a',
  gridLine: '#0f3d22',
  target: '#00ff88',
  targetSelected: '#ffff00',
  targetAlert: '#ff3333',
  targetCritical: '#ff0000',
  track: '#004422',
  trajectory: '#004488',
  label: '#00ff88',
  labelSelected: '#ffff00',
  stca: '#ff2200',
  msaw: '#ff8800',
  range: '#1a4a2a',
  sweep: 'rgba(0,255,100,0.06)',
  velocityVector: '#00cc66',
};

export default function RadarScope({ flights, tracks, alerts, selectedId, trajectories, showTrajectories, showTracks, onFlightClick }) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const sweepAngle = useRef(0);
  const [hoveredId, setHoveredId] = useState(null);
  const { zoom, mapCenter } = useSelector(s => s.ui);

  // Convert lat/lon to canvas coordinates
  const toCanvas = useCallback((lat, lon, w, h) => {
    const scale = zoom * 8;
    const cx = w / 2 + (lon - mapCenter[1]) * scale;
    const cy = h / 2 - (lat - mapCenter[0]) * scale;
    return [cx, cy];
  }, [zoom, mapCenter]);

  const getAlertSeverity = useCallback((callsign) => {
    const a = alerts.find(al =>
      (al.callsign_primary === callsign || al.callsign_secondary === callsign) && al.is_active !== false
    );
    return a?.severity || null;
  }, [alerts]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { width: w, height: h } = canvas;

    // Background
    ctx.fillStyle = COLORS.bg;
    ctx.fillRect(0, 0, w, h);

    // Range rings
    const rings = [50, 100, 150, 200, 250];
    rings.forEach((r) => {
      const px = r * zoom * 0.15;
      ctx.beginPath();
      ctx.arc(w / 2, h / 2, px, 0, Math.PI * 2);
      ctx.strokeStyle = COLORS.range;
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.fillStyle = '#1a4a2a55';
      ctx.font = '10px monospace';
      ctx.fillText(`${r}NM`, w / 2 + px + 3, h / 2);
    });

    // Grid lines
    ctx.strokeStyle = COLORS.gridLine;
    ctx.lineWidth = 0.3;
    for (let x = 0; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }

    // Radar sweep
    sweepAngle.current = (sweepAngle.current + 0.015) % (Math.PI * 2);
    const grad = ctx.createConicalGradient
      ? null
      : null;
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate(sweepAngle.current);
    const sweepGrad = ctx.createLinearGradient(0, 0, Math.max(w, h), 0);
    sweepGrad.addColorStop(0, 'rgba(0,255,100,0.18)');
    sweepGrad.addColorStop(1, 'rgba(0,255,100,0)');
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, Math.max(w, h), -0.15, 0.15);
    ctx.closePath();
    ctx.fillStyle = sweepGrad;
    ctx.fill();
    ctx.restore();

    // Draw tracks
    if (showTracks) {
      Object.entries(tracks).forEach(([callsign, pts]) => {
        if (pts.length < 2) return;
        ctx.beginPath();
        pts.forEach(({ lat, lon }, i) => {
          const [x, y] = toCanvas(lat, lon, w, h);
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        });
        ctx.strokeStyle = COLORS.track;
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }

    // Draw trajectories
    if (showTrajectories && selectedId && trajectories[selectedId]) {
      const pts = trajectories[selectedId];
      ctx.beginPath();
      pts.forEach((pt, i) => {
        const [x, y] = toCanvas(pt.lat, pt.lon, w, h);
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = COLORS.trajectory;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Draw aircraft
    flights.forEach((flight) => {
      if (!flight.position_lat || !flight.position_lon) return;
      const [x, y] = toCanvas(flight.position_lat, flight.position_lon, w, h);
      const isSelected = flight.id === selectedId || flight.id === hoveredId;
      const severity = getAlertSeverity(flight.callsign);
      const color = severity === 'CRITICAL' ? COLORS.targetCritical
        : severity === 'HIGH' ? COLORS.targetAlert
        : isSelected ? COLORS.targetSelected
        : COLORS.target;

      // Velocity vector
      if (flight.ground_speed && flight.track_angle !== undefined) {
        const rad = (flight.track_angle * Math.PI) / 180;
        const vecLen = (flight.ground_speed / 500) * zoom * 3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.sin(rad) * vecLen, y - Math.cos(rad) * vecLen);
        ctx.strokeStyle = COLORS.velocityVector;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      // Target symbol (aircraft icon)
      ctx.save();
      ctx.translate(x, y);
      const angle = ((flight.track_angle || 0) * Math.PI) / 180;
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(4, 3);
      ctx.lineTo(0, 1);
      ctx.lineTo(-4, 3);
      ctx.closePath();
      ctx.fill();

      // Alert ring
      if (severity === 'CRITICAL') {
        ctx.beginPath();
        ctx.arc(0, 0, 10, 0, Math.PI * 2);
        ctx.strokeStyle = COLORS.stca;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();

      // Label
      ctx.fillStyle = isSelected ? COLORS.labelSelected : COLORS.label;
      ctx.font = isSelected ? 'bold 11px monospace' : '10px monospace';
      const alt = flight.altitude ? `FL${String(Math.round(flight.altitude / 100)).padStart(3, '0')}` : '???';
      const spd = flight.ground_speed ? Math.round(flight.ground_speed / 10) : '??';
      ctx.fillText(flight.callsign, x + 8, y - 4);
      ctx.fillText(`${alt} ${spd}`, x + 8, y + 6);
    });

    animRef.current = requestAnimationFrame(draw);
  }, [flights, tracks, alerts, selectedId, hoveredId, trajectories, showTrajectories, showTracks, toCanvas, getAlertSeverity, zoom]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const resize = () => {
      canvas.width = canvas.offsetWidth;
      canvas.height = canvas.offsetHeight;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    animRef.current = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(animRef.current); ro.disconnect(); };
  }, [draw]);

  const handleClick = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let closest = null, minDist = 20;
    flights.forEach((f) => {
      if (!f.position_lat) return;
      const [x, y] = toCanvas(f.position_lat, f.position_lon, canvas.width, canvas.height);
      const d = Math.hypot(mx - x, my - y);
      if (d < minDist) { minDist = d; closest = f; }
    });
    if (closest) onFlightClick(closest.id);
  }, [flights, toCanvas, onFlightClick]);

  const handleMouseMove = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let closest = null, minDist = 20;
    flights.forEach((f) => {
      if (!f.position_lat) return;
      const [x, y] = toCanvas(f.position_lat, f.position_lon, canvas.width, canvas.height);
      const d = Math.hypot(mx - x, my - y);
      if (d < minDist) { minDist = d; closest = f; }
    });
    setHoveredId(closest?.id || null);
  }, [flights, toCanvas]);

  return (
    <div className="radar-wrap">
      <div className="radar-toolbar">
        <span className="radar-label">AVIONIX RADAR SCOPE</span>
        <span className="radar-stat">{flights.length} tracks</span>
        <span className="radar-stat">{alerts.filter(a => a.is_active !== false).length} alerts</span>
      </div>
      <canvas
        ref={canvasRef}
        className="radar-canvas"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        style={{ cursor: hoveredId ? 'pointer' : 'crosshair' }}
      />
    </div>
  );
}
