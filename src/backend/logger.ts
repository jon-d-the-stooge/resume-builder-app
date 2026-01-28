/**
 * Logger Configuration
 *
 * Configures pino logger with environment-aware formatting:
 * - Production: JSON output for log aggregation (ELK, Datadog, CloudWatch)
 * - Development: Pretty-printed colorized output for readability
 *
 * Usage:
 *   import { logger } from './logger';
 *   logger.info({ userId: '123' }, 'User logged in');
 *   logger.error({ err, requestId }, 'Request failed');
 */

import pino, { Logger, LoggerOptions } from 'pino';
import { config } from './config';

// =============================================================================
// Configuration
// =============================================================================

const LOG_LEVEL = process.env.LOG_LEVEL || (config.server.isDevelopment ? 'debug' : 'info');

/**
 * Base logger options shared across environments
 */
const baseOptions: LoggerOptions = {
  level: LOG_LEVEL,
  // Add standard fields to all log entries
  base: {
    pid: process.pid,
    env: config.server.nodeEnv,
  },
  // Customize timestamp format
  timestamp: pino.stdTimeFunctions.isoTime,
  // Redact sensitive fields from logs
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      'password',
      'apiKey',
      'token',
      'secret',
      '*.password',
      '*.apiKey',
      '*.token',
      '*.secret',
    ],
    remove: true,
  },
};

/**
 * Development-specific options with pretty printing
 */
const developmentOptions: LoggerOptions = {
  ...baseOptions,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'SYS:HH:MM:ss.l',
      ignore: 'pid,hostname,env',
      messageFormat: '{msg}',
      singleLine: false,
    },
  },
};

/**
 * Production options - JSON output for log aggregation
 */
const productionOptions: LoggerOptions = {
  ...baseOptions,
  // Faster JSON serialization in production
  formatters: {
    level: (label) => ({ level: label }),
    bindings: (bindings) => ({
      pid: bindings.pid,
      host: bindings.hostname,
      env: config.server.nodeEnv,
    }),
  },
};

// =============================================================================
// Logger Instance
// =============================================================================

/**
 * Main application logger instance
 */
export const logger: Logger = pino(
  config.server.isDevelopment ? developmentOptions : productionOptions
);

// =============================================================================
// Child Logger Factories
// =============================================================================

/**
 * Create a child logger for a specific component/module
 * Child loggers inherit parent config but add component context
 *
 * @example
 * const authLogger = createComponentLogger('auth');
 * authLogger.info({ userId }, 'User authenticated');
 */
export function createComponentLogger(component: string): Logger {
  return logger.child({ component });
}

/**
 * Create a child logger with request context
 * Useful for tracing requests through the application
 *
 * @example
 * const reqLogger = createRequestLogger(req.id, req.user?.id);
 * reqLogger.info('Processing payment');
 */
export function createRequestLogger(requestId: string, userId?: string): Logger {
  return logger.child({
    requestId,
    ...(userId && { userId }),
  });
}

// =============================================================================
// Specialized Loggers
// =============================================================================

/**
 * Pre-configured loggers for common components
 */
export const loggers = {
  /** HTTP request/response logging */
  http: createComponentLogger('http'),
  /** Job queue operations */
  jobs: createComponentLogger('jobs'),
  /** Authentication/authorization */
  auth: createComponentLogger('auth'),
  /** Database operations */
  db: createComponentLogger('db'),
  /** External API calls */
  api: createComponentLogger('api'),
  /** LLM/AI operations */
  llm: createComponentLogger('llm'),
  /** Career agent operations */
  agent: createComponentLogger('agent'),
};

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Serialize an error for structured logging
 * Extracts useful properties from Error objects
 */
export function serializeError(err: unknown): Record<string, unknown> {
  if (err instanceof Error) {
    // Extract additional properties from custom error classes
    const extras: Record<string, unknown> = {};
    for (const key of Object.getOwnPropertyNames(err)) {
      if (!['name', 'message', 'stack'].includes(key)) {
        extras[key] = (err as unknown as Record<string, unknown>)[key];
      }
    }
    return {
      type: err.constructor.name,
      message: err.message,
      stack: config.server.isDevelopment ? err.stack : undefined,
      ...extras,
    };
  }
  return { message: String(err) };
}

/**
 * Log a fatal error and optionally exit
 * Use for unrecoverable errors during startup
 */
export function logFatal(err: unknown, message: string, exitCode = 1): void {
  logger.fatal({ err: serializeError(err) }, message);
  if (exitCode !== 0) {
    process.exit(exitCode);
  }
}

export default logger;
