/**
 * Error handling utilities for the Resume Content Ingestion system
 * 
 * This file now re-exports from the shared error handler.
 * All error handling functionality has been moved to src/shared/errors/
 * for reuse across features.
 * 
 * @deprecated Import from 'src/shared/errors' instead
 */

export {
  ErrorCategory,
  ErrorSeverity,
  ErrorInfo,
  AppError
} from '../shared/errors/types';

export { ErrorHandler } from '../shared/errors/handler';
export { ErrorLogger } from '../shared/errors/logger';