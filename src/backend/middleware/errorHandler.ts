/**
 * Error handling middleware - provides centralized error handling for the API.
 * Catches errors from route handlers, formats error responses,
 * and handles logging of server-side errors.
 */

import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('API Error:', err.message);

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
};
