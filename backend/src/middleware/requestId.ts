import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import logger from '../lib/logger';

/**
 * Middleware: propagate or generate a request ID for structured logging.
 *
 * - Reads X-Request-ID from incoming request
 * - Sanitizes: truncates to 128 chars, strips \n \r " (prevents log injection)
 * - Falls back to uuidv4() if absent or empty after sanitizing
 * - Attaches req.requestId and req.log (child logger with requestId bound)
 * - Echoes the final value back as X-Request-ID response header
 */
export function requestIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const raw = req.headers['x-request-id'];
  const rawStr = Array.isArray(raw) ? raw[0] : raw;

  let id = (rawStr || '')
    .slice(0, 128)
    .replace(/[\n\r"]/g, '');

  if (!id) {
    id = uuidv4();
  }

  req.requestId = id;
  req.log = logger.child({ requestId: id });
  res.setHeader('X-Request-ID', id);

  next();
}
