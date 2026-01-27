/**
 * Request Logging Middleware
 *
 * Logs HTTP requests with method, path, duration, and status code.
 * Uses pino-http for automatic request/response logging with timing.
 *
 * Log format includes:
 * - method: HTTP method (GET, POST, etc.)
 * - url: Request path
 * - statusCode: Response status code
 * - responseTime: Request duration in milliseconds
 * - requestId: Unique identifier for request tracing
 */

import pinoHttp from 'pino-http';
import { randomUUID } from 'crypto';
import { logger } from '../logger';
import { config } from '../config';
import type { Request } from 'express';
import type { IncomingMessage, ServerResponse } from 'http';

/**
 * Generate a unique request ID for tracing
 */
function genReqId(req: IncomingMessage): string {
  // Use existing request ID header if present (from load balancer/proxy)
  const existingId = req.headers['x-request-id'] || req.headers['x-correlation-id'];
  if (typeof existingId === 'string') {
    return existingId;
  }
  return randomUUID();
}

/**
 * Custom serializers for request/response logging
 */
const serializers = {
  req(req: IncomingMessage & { id?: string; raw?: Request }) {
    const expressReq = req.raw as Request | undefined;
    return {
      id: req.id,
      method: req.method,
      url: req.url,
      // Include user ID if authenticated
      userId: expressReq?.user?.id,
      // Include useful headers
      headers: {
        host: req.headers.host,
        'user-agent': req.headers['user-agent'],
        'content-type': req.headers['content-type'],
        'content-length': req.headers['content-length'],
      },
    };
  },
  res(res: ServerResponse) {
    return {
      statusCode: res.statusCode,
    };
  },
};

/**
 * Determine log level based on status code
 */
function customLogLevel(req: IncomingMessage, res: ServerResponse, err?: Error): string {
  if (err || res.statusCode >= 500) {
    return 'error';
  }
  if (res.statusCode >= 400) {
    return 'warn';
  }
  // Don't log health checks at info level (too noisy)
  if (req.url === '/api/health') {
    return 'debug';
  }
  return 'info';
}

/**
 * Custom message formatter for request logs
 */
function customSuccessMessage(req: IncomingMessage, res: ServerResponse, responseTime: number): string {
  return `${req.method} ${req.url} ${res.statusCode} ${responseTime.toFixed(0)}ms`;
}

function customErrorMessage(req: IncomingMessage, res: ServerResponse, err: Error): string {
  return `${req.method} ${req.url} ${res.statusCode} - ${err.message}`;
}

/**
 * Request logging middleware
 * Automatically logs all HTTP requests with timing and status
 */
export const requestLogger = pinoHttp({
  logger: logger.child({ component: 'http' }),
  genReqId,
  serializers,
  customLogLevel,
  customSuccessMessage,
  customErrorMessage,
  // Automatically log request/response
  autoLogging: {
    ignore: (req) => {
      // Skip logging for health checks in production
      if (config.server.isProduction && req.url === '/api/health') {
        return true;
      }
      return false;
    },
  },
  // Custom attributes to add to every log
  customAttributeKeys: {
    req: 'req',
    res: 'res',
    err: 'err',
    responseTime: 'responseTime',
    reqId: 'requestId',
  },
  // Log request body for non-GET requests (with size limit)
  customProps: (req: Request) => {
    const props: Record<string, unknown> = {};

    // Add request body for debugging (only in development, with size limit)
    if (config.server.isDevelopment && req.method !== 'GET' && req.body) {
      const bodyStr = JSON.stringify(req.body);
      if (bodyStr.length <= 1000) {
        props.body = req.body;
      } else {
        props.bodyTruncated = true;
        props.bodySize = bodyStr.length;
      }
    }

    return props;
  },
});

export default requestLogger;
