import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

const AUTH_ENABLED = process.env.AUTH_ENABLED === 'true';
const KEYCLOAK_URL = process.env.KEYCLOAK_URL || 'http://localhost:8080';
const KEYCLOAK_REALM = process.env.KEYCLOAK_REALM || 'eu-jap-hack';
const JWKS_URI = `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}/protocol/openid-connect/certs`;

const client = jwksClient({ jwksUri: JWKS_URI, cache: true, rateLimit: true });

function getKey(header: jwt.JwtHeader, callback: jwt.SigningKeyCallback) {
  client.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err);
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
}

function getMockUser(role?: string): Express.Request['user'] {
  // Default mock users based on role for development without Keycloak
  const mockUsers: Record<string, Express.Request['user']> = {
    admin: { sub: 'mock-admin', preferred_username: 'toyota-admin', email: 'toyota-admin@toyota-global.com', realm_access: { roles: ['admin'] } },
    customer: { sub: 'mock-customer', preferred_username: 'mario-sanchez', email: 'mario.sanchez@email.com', realm_access: { roles: ['customer'] } },
    insurance_agent: { sub: 'mock-agent', preferred_username: 'tokiomarine-agent', email: 'agent@tokiomarine.com', realm_access: { roles: ['insurance_agent'] } },
    company_admin: { sub: 'mock-company', preferred_username: 'company-admin', email: 'admin@company.eu', realm_access: { roles: ['company_admin'] } },
  };
  return role ? mockUsers[role] || mockUsers.customer : mockUsers.customer;
}

function verifyToken(token: string): Promise<Express.Request['user']> {
  return new Promise((resolve, reject) => {
    jwt.verify(
      token,
      getKey,
      { algorithms: ['RS256'], issuer: `${KEYCLOAK_URL}/realms/${KEYCLOAK_REALM}` },
      (err, decoded) => {
        if (err) return reject(err);
        resolve(decoded as Express.Request['user']);
      }
    );
  });
}

export async function authenticate(req: Request, res: Response, next: NextFunction) {
  if (!AUTH_ENABLED) {
    req.user = getMockUser();
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }

  try {
    const token = authHeader.slice(7);
    req.user = await verifyToken(token);
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export async function optionalAuth(req: Request, res: Response, next: NextFunction) {
  if (!AUTH_ENABLED) {
    req.user = getMockUser();
    return next();
  }

  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return next(); // No token, proceed without user
  }

  try {
    const token = authHeader.slice(7);
    req.user = await verifyToken(token);
  } catch {
    // Invalid token, proceed without user
  }
  next();
}

export function requireRole(role: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!AUTH_ENABLED) {
      req.user = getMockUser(role);
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Missing or invalid Authorization header' });
    }

    try {
      const token = authHeader.slice(7);
      req.user = await verifyToken(token);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const roles = req.user?.realm_access?.roles || [];
    if (!roles.includes(role)) {
      return res.status(403).json({ error: `Requires role: ${role}` });
    }

    next();
  };
}
