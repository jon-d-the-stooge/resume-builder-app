/**
 * Error handling middleware - provides centralized error handling for the API.
 * Catches errors from route handlers, formats error responses,
 * and handles structured logging of server-side errors.
 */

import { Request, Response, NextFunction } from 'express';
import { logger, serializeError } from '../logger';
import { config } from '../config';

/**
 * Custom error class for API errors with status codes
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/**
 * Centralized error handler middleware
 * Logs errors with full context and returns appropriate responses
 */
export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) => {
  // Determine status code and error type
  const statusCode = err instanceof ApiError ? err.statusCode : 500;
  const isClientError = statusCode >= 400 && statusCode < 500;
  const isServerError = statusCode >= 500;

  // Build error context for logging
  const errorContext = {
    err: serializeError(err),
    requestId: (req as Request & { id?: string }).id,
    method: req.method,
    path: req.path,
    userId: req.user?.id,
    statusCode,
    ...(err instanceof ApiError && err.code && { errorCode: err.code }),
  };

  // Log at appropriate level
  if (isServerError) {
    logger.error(errorContext, `Request failed: ${err.message}`);
  } else if (isClientError) {
    logger.warn(errorContext, `Client error: ${err.message}`);
  }

  // Build response
  const response: Record<string, unknown> = {
    error: isServerError ? 'Internal Server Error' : err.message,
  };

  if (config.server.isDevelopment) {
    response.message = err.message;
    response.stack = err.stack;
  }

  if (err instanceof ApiError) {
    if (err.code) {
      response.code = err.code;
    }
    if (err.details && config.server.isDevelopment) {
      response.details = err.details;
    }
  }

  res.status(statusCode).json(response);
};

/**
 * Async handler wrapper to catch errors in async route handlers
 * Forwards errors to the error handling middleware
 */
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
