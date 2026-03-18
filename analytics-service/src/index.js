// analytics-service/src/index.js
// AVIONIX Analytics Service
// Real-time sector metrics, controller workload, delay analysis, KPI dashboards

import express from 'express';
import dotenv from 'dotenv';
import { createLogger, createSuccessResponse, createErrorResponse } from '../../shared/utils/helpers.js';
import { authenticate, authorize, requestLogger, errorHandler, notFound } from '../../shared/middleware/keycloak-auth.js';
import { queryOne, queryAll, healthCheck } from '../../shared/db/connection.js';
import { WorkloadAnalyzer } from './ml/workload-analyzer.js';

dotenv.config();
const app = express();
const logger = createLogger('ANALYTICS');
const workloadAnalyzer = new WorkloadAnalyzer();

app.use(express.json());
app.use(requestLogger);
app.use('/api/analytics', authenticate);

app.get('/health', async (req, res) => {
  try {
    const db = await healthCheck();
    res.json({ status: 'healthy', service: 'analytics', db });
  } catch (e) {
    res.status(503).json({ status: 'unhealthy', error: e.message });
  }
});

// ─── REAL-TIME SECTOR METRICS ─────────────────────────────────────────────────
app.get('/api/analytics/sectors/metrics',
  authorize('ATC_SUPERVISOR', 'OPERATIONS_MANAGER', 'DATA_ANALYST', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const metrics = await queryAll(`
        SELECT
          s.id as sector_id, s.name as sector_name,
          COUNT(f.id) FILTER (WHERE f.status='ACTIVE') as active_flights,
          AVG(sr.ground_speed) FILTER (WHERE f.status='ACTIVE') as avg_speed,
          AVG(sr.altitude) FILTER (WHERE f.status='ACTIVE') as avg_altitude,
          COUNT(sa.id) FILTER (WHERE sa.is_active) as active_alerts,
          COUNT(h.id) FILTER (WHERE h.status='PENDING') as pending_handoffs
        FROM sectors s
        LEFT JOIN flights f ON f.sector_id=s.id
        LEFT JOIN surveillance_reports sr ON sr.flight_id=f.id
          AND sr.timestamp=(SELECT MAX(timestamp) FROM surveillance_reports WHERE flight_id=f.id)
        LEFT JOIN safety_alerts sa ON (sa.flight_id_primary=f.id OR sa.flight_id_secondary=f.id)
        LEFT JOIN handoffs h ON h.from_sector_id=s.id OR h.to_sector_id=s.id
        GROUP BY s.id, s.name`);

      // Enrich with ML workload scores
      const enriched = metrics.map(m => ({
        ...m,
        workloadScore: workloadAnalyzer.score(m.active_flights, m.active_alerts, m.pending_handoffs),
        workloadLevel: workloadAnalyzer.classify(m.active_flights, m.active_alerts)
      }));

      res.json(createSuccessResponse(enriched));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── DELAY ANALYSIS ───────────────────────────────────────────────────────────
app.get('/api/analytics/delays',
  authorize('OPERATIONS_MANAGER', 'DATA_ANALYST', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { airport, hours = 24 } = req.query;
      let q = `
        SELECT
          f.departure_airport, f.destination_airport,
          f.callsign, f.aircraft_type,
          f.departure_time as scheduled,
          f.actual_departure_time as actual,
          EXTRACT(EPOCH FROM (f.actual_departure_time - f.departure_time))/60 as delay_minutes,
          CASE
            WHEN EXTRACT(EPOCH FROM (f.actual_departure_time - f.departure_time))/60 > 60 THEN 'SEVERE'
            WHEN EXTRACT(EPOCH FROM (f.actual_departure_time - f.departure_time))/60 > 15 THEN 'MODERATE'
            ELSE 'MINOR'
          END as delay_category
        FROM flights f
        WHERE f.actual_departure_time IS NOT NULL
          AND f.departure_time > NOW()-MAKE_INTERVAL(hours=>$1::int)`;
      const params = [hours];
      if (airport) { params.push(airport); q += ` AND (f.departure_airport=$${params.length} OR f.destination_airport=$${params.length})`; }
      q += ' ORDER BY delay_minutes DESC NULLS LAST';

      const delays = await queryAll(q, params);
      const avgDelay = delays.reduce((s, d) => s + (d.delay_minutes || 0), 0) / (delays.length || 1);

      res.json(createSuccessResponse({
        totalFlights: delays.length,
        averageDelayMinutes: Math.round(avgDelay * 10) / 10,
        delayedFlights: delays.filter(d => d.delay_minutes > 15).length,
        delays
      }));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── SAFETY TREND ANALYTICS ───────────────────────────────────────────────────
app.get('/api/analytics/safety/trends',
  authorize('SAFETY_OFFICER', 'ATC_SUPERVISOR', 'DATA_ANALYST', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { days = 30 } = req.query;
      const trends = await queryAll(`
        SELECT
          DATE_TRUNC('day', detection_time) as date,
          alert_type,
          severity,
          COUNT(*) as count,
          AVG(horizontal_distance) as avg_horizontal_nm,
          AVG(vertical_distance) as avg_vertical_ft,
          AVG(time_to_collision) as avg_ttc_seconds
        FROM safety_alerts
        WHERE detection_time > NOW()-MAKE_INTERVAL(days=>$1::int)
        GROUP BY DATE_TRUNC('day', detection_time), alert_type, severity
        ORDER BY date DESC, count DESC`, [days]);

      res.json(createSuccessResponse(trends));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── CONTROLLER WORKLOAD ──────────────────────────────────────────────────────
app.get('/api/analytics/workload/controllers',
  authorize('ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const controllers = await queryAll(`
        SELECT
          u.id, u.preferred_username as name,
          s.name as sector_name,
          COUNT(f.id) as active_flights,
          COUNT(sa.id) FILTER (WHERE sa.is_active) as active_alerts,
          COUNT(h.id) FILTER (WHERE h.status='PENDING') as pending_handoffs,
          MAX(sr.timestamp) as last_surveillance_update
        FROM users u
        LEFT JOIN sectors s ON s.assigned_controller_id=u.id
        LEFT JOIN flights f ON f.sector_id=s.id AND f.status='ACTIVE'
        LEFT JOIN safety_alerts sa ON sa.flight_id_primary=f.id
        LEFT JOIN handoffs h ON (h.from_sector_id=s.id OR h.to_sector_id=s.id) AND h.status='PENDING'
        LEFT JOIN surveillance_reports sr ON sr.flight_id=f.id
        WHERE 'ATC_CONTROLLER' = ANY(u.roles)
        GROUP BY u.id, u.preferred_username, s.name`);

      const enriched = controllers.map(c => ({
        ...c,
        workloadScore: workloadAnalyzer.score(c.active_flights, c.active_alerts, c.pending_handoffs),
        workloadLevel: workloadAnalyzer.classify(c.active_flights, c.active_alerts),
        recommendation: workloadAnalyzer.recommend(c.active_flights, c.active_alerts)
      }));

      res.json(createSuccessResponse(enriched));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── TRAFFIC FLOW STATISTICS ──────────────────────────────────────────────────
app.get('/api/analytics/traffic/flow',
  authorize('OPERATIONS_MANAGER', 'DATA_ANALYST', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { hours = 6, granularity = '15 minutes' } = req.query;
      const flow = await queryAll(`
        SELECT
          DATE_TRUNC($1, f.departure_time) as time_bucket,
          f.departure_airport,
          COUNT(*) as departures,
          AVG(f.cruise_altitude) as avg_cruise_altitude,
          COUNT(DISTINCT f.aircraft_type) as aircraft_type_diversity
        FROM flights f
        WHERE f.departure_time > NOW()-MAKE_INTERVAL(hours=>$2::int)
          AND f.status != 'CANCELLED'
        GROUP BY time_bucket, f.departure_airport
        ORDER BY time_bucket DESC, departures DESC
        LIMIT 500`, [granularity, hours]);

      res.json(createSuccessResponse(flow));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── KPI DASHBOARD ────────────────────────────────────────────────────────────
app.get('/api/analytics/kpis',
  authorize('OPERATIONS_MANAGER', 'DATA_ANALYST', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const [flights, alerts, separations] = await Promise.all([
        queryOne(`SELECT
          COUNT(*) FILTER (WHERE status='ACTIVE') as active,
          COUNT(*) FILTER (WHERE departure_time::date=CURRENT_DATE) as today,
          COUNT(*) FILTER (WHERE status='CANCELLED' AND departure_time::date=CURRENT_DATE) as cancelled_today
          FROM flights`),
        queryOne(`SELECT
          COUNT(*) FILTER (WHERE is_active) as active,
          COUNT(*) FILTER (WHERE severity='CRITICAL' AND detection_time::date=CURRENT_DATE) as critical_today,
          COUNT(*) FILTER (WHERE detection_time::date=CURRENT_DATE) as total_today
          FROM safety_alerts`),
        queryOne(`SELECT
          AVG(horizontal_distance) as avg_horizontal_nm,
          MIN(horizontal_distance) as min_horizontal_nm,
          COUNT(*) FILTER (WHERE horizontal_distance < 5 AND vertical_distance < 1000) as violations_today
          FROM safety_alerts
          WHERE detection_time::date=CURRENT_DATE`)
      ]);

      res.json(createSuccessResponse({
        flights,
        alerts,
        separation: separations,
        timestamp: new Date().toISOString()
      }));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.ANALYTICS_PORT || 3006;
app.listen(PORT, () => logger.info(`Analytics service running on port ${PORT}`));

export default app;
