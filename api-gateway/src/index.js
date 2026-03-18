// api-gateway/src/index.js
// AVIONIX API Gateway
// Single HTTPS entry point — auth validation, routing, WebSocket proxy, rate limiting

import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import httpProxy from 'http-proxy';
import dotenv from 'dotenv';
import { createLogger } from '../../shared/utils/helpers.js';
import { authenticate, rateLimit, requestLogger } from '../../shared/middleware/keycloak-auth.js';

dotenv.config();
const app = express();
const server = createServer(app);
const logger = createLogger('API-GATEWAY');

// ─── SERVICE REGISTRY ─────────────────────────────────────────────────────────
const SERVICES = {
  fdps:          process.env.FDPS_URL          || 'http://fdps-service:3001',
  snet:          process.env.SNET_URL          || 'http://snet-service:3002',
  surveillance:  process.env.SURVEILLANCE_URL  || 'http://surveillance-service:3003',
  coordination:  process.env.COORDINATION_URL  || 'http://coordination-service:3004',
  weather:       process.env.WEATHER_URL       || 'http://weather-service:3005',
  analytics:     process.env.ANALYTICS_URL     || 'http://analytics-service:3006',
  ml:            process.env.ML_URL            || 'http://ml-service:3007',
};

const proxy = httpProxy.createProxyServer({ changeOrigin: true });
proxy.on('error', (err, req, res) => {
  logger.error('Proxy error', { error: err.message, path: req.path });
  if (!res.headersSent) res.status(502).json({ success: false, error: { code: 'GATEWAY_ERROR', message: 'Upstream service unavailable' } });
});

// ─── WEBSOCKET AGGREGATOR ─────────────────────────────────────────────────────
// Single WS connection for clients; aggregates from all backend WS feeds
const clientWss = new WebSocketServer({ server, path: '/ws' });
const upstreamSockets = new Map();

const connectUpstream = (name, url) => {
  const wsUrl = url.replace('http://', 'ws://').replace('https://', 'wss://');
  try {
    const ws = new WebSocket(`${wsUrl}`);
    ws.on('message', (data) => {
      // Broadcast to all connected clients
      clientWss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(data);
      });
    });
    ws.on('close', () => {
      logger.warn(`Upstream WS closed: ${name}, reconnecting in 5s`);
      setTimeout(() => connectUpstream(name, url), 5000);
    });
    ws.on('error', (e) => logger.error(`Upstream WS error: ${name}`, { error: e.message }));
    upstreamSockets.set(name, ws);
  } catch (e) {
    logger.error(`Upstream WS connect failed: ${name}`, { error: e.message });
  }
};

// Connect to SNET and Surveillance WebSocket feeds
setTimeout(() => {
  connectUpstream('snet', SERVICES.snet);
  connectUpstream('surveillance', SERVICES.surveillance);
}, 3000);

clientWss.on('connection', (ws, req) => {
  logger.info(`Client WS connected`, { ip: req.socket.remoteAddress });
  ws.on('error', (e) => logger.error('Client WS error', { error: e.message }));
});

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(express.json());
app.use(requestLogger);
app.use(rateLimit(500, 60000));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,PATCH,OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── HEALTH ───────────────────────────────────────────────────────────────────
app.get('/health', (req, res) => res.json({
  status: 'healthy', service: 'api-gateway',
  services: Object.keys(SERVICES),
  wsClients: clientWss.clients.size,
  ts: new Date().toISOString()
}));

// Service health aggregation
app.get('/health/all', authenticate, async (req, res) => {
  const results = await Promise.allSettled(
    Object.entries(SERVICES).map(([name, url]) =>
      fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) })
        .then(r => r.json()).then(d => ({ name, status: d.status }))
        .catch(() => ({ name, status: 'unreachable' }))
    )
  );
  res.json({ services: results.map(r => r.value || r.reason) });
});

// ─── ROUTE DEFINITIONS ────────────────────────────────────────────────────────
const routes = [
  { prefix: '/api/fdps',         target: SERVICES.fdps,         auth: true },
  { prefix: '/api/snet',         target: SERVICES.snet,         auth: true },
  { prefix: '/api/surveillance', target: SERVICES.surveillance, auth: true },
  { prefix: '/api/coordination', target: SERVICES.coordination, auth: true },
  { prefix: '/api/weather',      target: SERVICES.weather,      auth: true },
  { prefix: '/api/analytics',    target: SERVICES.analytics,    auth: true },
  { prefix: '/api/ml',           target: SERVICES.ml,           auth: true },
];

routes.forEach(({ prefix, target, auth }) => {
  app.use(prefix, ...(auth ? [authenticate] : []), (req, res) => {
    proxy.web(req, res, { target });
  });
});

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: `Route ${req.method} ${req.path} not found` } }));

const PORT = process.env.GATEWAY_PORT || 4000;
server.listen(PORT, () => logger.info(`API Gateway running on port ${PORT}`));

export default app;
