// shared/middleware/keycloak-auth.js
// Keycloak JWT validation middleware with RBAC enforcement

import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { createErrorResponse } from '../utils/helpers.js';

const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'avionix';
const JWKS_URI = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`;

const client = jwksClient({
  jwksUri: JWKS_URI,
  cache: true,
  cacheMaxEntries: 10,
  cacheMaxAge: 600000, // 10 minutes
  rateLimit: true,
  jwksRequestsPerMinute: 10
});

const getSigningKey = (header, callback) => {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    callback(null, key.getPublicKey());
  });
};

/**
 * Verify Keycloak JWT and attach decoded user to req.user
 */
export const authenticate = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json(createErrorResponse('UNAUTHORIZED', 'Missing or invalid Authorization header'));
  }

  const token = authHeader.split(' ')[1];

  jwt.verify(token, getSigningKey, {
    audience: 'avionix-services',
    issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}`,
    algorithms: ['RS256']
  }, (err, decoded) => {
    if (err) {
      return res.status(401).json(createErrorResponse('UNAUTHORIZED', 'Token verification failed'));
    }

    // Extract roles from Keycloak token structure
    const realmRoles = decoded?.realm_access?.roles || [];
    const resourceRoles = decoded?.resource_access?.['avionix-services']?.roles || [];

    req.user = {
      id: decoded.sub,
      username: decoded.preferred_username,
      email: decoded.email,
      name: decoded.name,
      roles: [...new Set([...realmRoles, ...resourceRoles])],
      sessionId: decoded.sid,
      sector: decoded.sector || null
    };

    next();
  });
};

/**
 * Role-based access control — require one of the provided roles
 * Usage: authorize('ATC_CONTROLLER', 'ATC_SUPERVISOR')
 */
export const authorize = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json(createErrorResponse('UNAUTHORIZED', 'Not authenticated'));
  }

  const hasRole = allowedRoles.some(role => req.user.roles.includes(role));
  if (!hasRole) {
    return res.status(403).json(createErrorResponse('FORBIDDEN',
      `Required role(s): ${allowedRoles.join(', ')}. Your roles: ${req.user.roles.join(', ')}`));
  }

  next();
};

/**
 * Sector ownership check — controller can only modify their assigned sector
 */
export const authorizeSector = (req, res, next) => {
  const { sector } = req.params;

  // Supervisors and admins bypass sector restriction
  if (req.user.roles.some(r => ['SUPER_ADMIN', 'ATC_SUPERVISOR'].includes(r))) {
    return next();
  }

  if (req.user.sector && req.user.sector !== sector) {
    return res.status(403).json(createErrorResponse('FORBIDDEN',
      `You are assigned to sector ${req.user.sector}, not ${sector}`));
  }

  next();
};

/**
 * Request logger middleware
 */
export const requestLogger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const user = req.user?.username || 'anonymous';
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: duration,
      user,
      roles: req.user?.roles || [],
      ip: req.ip
    }));
  });
  next();
};

/**
 * Rate limiter per user role
 */
const rateLimitStore = new Map();
export const rateLimit = (maxRequests = 100, windowMs = 60000) => (req, res, next) => {
  const key = `${req.user?.id || req.ip}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };

  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }

  entry.count++;
  rateLimitStore.set(key, entry);

  res.setHeader('X-RateLimit-Limit', maxRequests);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - entry.count));
  res.setHeader('X-RateLimit-Reset', Math.ceil(entry.resetAt / 1000));

  if (entry.count > maxRequests) {
    return res.status(429).json(createErrorResponse('RATE_LIMITED', 'Too many requests'));
  }

  next();
};

export const errorHandler = (err, req, res, next) => {
  console.error(JSON.stringify({ ts: new Date().toISOString(), error: err.message, stack: err.stack }));
  res.status(err.status || 500).json(createErrorResponse(err.code || 'SERVER_ERROR', err.message));
};

export const notFound = (req, res) => {
  res.status(404).json(createErrorResponse('NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};
