// coordination-service/src/index.js
// AVIONIX Coordination Service
// Manages sector handoffs, FIR coordination, and OLDI/AIDC messaging

import express from 'express';
import dotenv from 'dotenv';
import { createLogger, createSuccessResponse, createErrorResponse } from '../../shared/utils/helpers.js';
import { authenticate, authorize, requestLogger, errorHandler, notFound } from '../../shared/middleware/keycloak-auth.js';
import { queryOne, queryAll, transaction, healthCheck } from '../../shared/db/connection.js';

dotenv.config();
const app = express();
const logger = createLogger('COORDINATION');

app.use(express.json());
app.use(requestLogger);
app.use('/api/coordination', authenticate);

app.get('/health', async (req, res) => {
  try {
    const db = await healthCheck();
    res.json({ status: 'healthy', service: 'coordination', db });
  } catch (e) {
    res.status(503).json({ status: 'unhealthy', error: e.message });
  }
});

// ─── HANDOFF INITIATION ───────────────────────────────────────────────────────
app.post('/api/coordination/handoffs',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { flight_id, from_sector, to_sector, transfer_altitude,
        transfer_condition, estimated_boundary_time } = req.body;

      const handoff = await queryOne(`
        INSERT INTO handoffs (flight_id, from_sector_id, to_sector_id,
          transfer_altitude, transfer_condition, estimated_boundary_time,
          status, initiated_by, initiated_at)
        VALUES ($1,$2,$3,$4,$5,$6,'PENDING',$7,NOW()) RETURNING *`,
        [flight_id, from_sector, to_sector, transfer_altitude,
          transfer_condition, estimated_boundary_time, req.user.id]);

      logger.info(`Handoff initiated flight=${flight_id} ${from_sector}->${to_sector}`);
      res.status(201).json(createSuccessResponse(handoff, 'Handoff initiated'));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

app.put('/api/coordination/handoffs/:handoffId/accept',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const handoff = await queryOne(`
        UPDATE handoffs SET status='ACCEPTED', accepted_by=$1, accepted_at=NOW()
        WHERE id=$2 RETURNING *`, [req.user.id, req.params.handoffId]);
      if (!handoff) return res.status(404).json(createErrorResponse('NOT_FOUND', 'Handoff not found'));
      res.json(createSuccessResponse(handoff, 'Handoff accepted'));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

app.put('/api/coordination/handoffs/:handoffId/transfer',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const result = await transaction(async (client) => {
        const handoff = await client.query(`
          UPDATE handoffs SET status='TRANSFERRED', transferred_at=NOW()
          WHERE id=$1 AND status='ACCEPTED' RETURNING *`, [req.params.handoffId]);
        if (!handoff.rows[0]) throw new Error('Handoff not found or not accepted');

        // Update flight sector ownership
        await client.query(`
          UPDATE flights SET sector_id=$1, updated_at=NOW() WHERE id=$2`,
          [handoff.rows[0].to_sector_id, handoff.rows[0].flight_id]);

        return handoff.rows[0];
      });
      res.json(createSuccessResponse(result, 'Transfer complete'));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

app.get('/api/coordination/handoffs',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'ATC_TRAINEE', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { sector, status } = req.query;
      let q = 'SELECT * FROM handoffs WHERE 1=1';
      const params = [];
      if (sector) { params.push(sector); q += ` AND (from_sector_id=$${params.length} OR to_sector_id=$${params.length})`; }
      if (status) { params.push(status); q += ` AND status=$${params.length}`; }
      q += ' ORDER BY initiated_at DESC LIMIT 200';
      const handoffs = await queryAll(q, params);
      res.json(createSuccessResponse(handoffs));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── CLEARANCES ───────────────────────────────────────────────────────────────
app.post('/api/coordination/clearances',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const { flight_id, type, instruction, cleared_altitude,
        cleared_route, cleared_speed, valid_until } = req.body;
      // type: 'ROUTE' | 'ALTITUDE' | 'SPEED' | 'APPROACH' | 'DEPARTURE' | 'TAXI'

      const clearance = await queryOne(`
        INSERT INTO clearances (flight_id, clearance_type, instruction,
          cleared_altitude, cleared_route, cleared_speed,
          issued_by, issued_at, valid_until)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8) RETURNING *`,
        [flight_id, type, instruction, cleared_altitude,
          cleared_route, cleared_speed, req.user.id, valid_until]);

      logger.info(`Clearance issued flight=${flight_id} type=${type}`, { user: req.user.username });
      res.status(201).json(createSuccessResponse(clearance, 'Clearance issued'));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

app.get('/api/coordination/clearances/:flightId',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'ATC_TRAINEE', 'PILOT', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const clearances = await queryAll(`
        SELECT * FROM clearances WHERE flight_id=$1 ORDER BY issued_at DESC`,
        [req.params.flightId]);
      res.json(createSuccessResponse(clearances));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

// ─── SECTORS ─────────────────────────────────────────────────────────────────
app.get('/api/coordination/sectors',
  authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR', 'ATC_TRAINEE', 'OPERATIONS_MANAGER', 'SUPER_ADMIN'),
  async (req, res) => {
    try {
      const sectors = await queryAll(`
        SELECT s.*, u.preferred_username as controller_name,
               COUNT(f.id) as active_flights
        FROM sectors s
        LEFT JOIN users u ON s.assigned_controller_id=u.id
        LEFT JOIN flights f ON f.sector_id=s.id AND f.status='ACTIVE'
        GROUP BY s.id, u.preferred_username`);
      res.json(createSuccessResponse(sectors));
    } catch (e) {
      res.status(500).json(createErrorResponse('SERVER_ERROR', e.message));
    }
  }
);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.COORDINATION_PORT || 3004;
app.listen(PORT, () => logger.info(`Coordination service running on port ${PORT}`));

export default app;
