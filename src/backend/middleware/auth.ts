/**
 * Authentication Middleware
 *
 * Validates JWT tokens from Auth0 using express-oauth2-jwt-bearer.
 * Extracts user information from token claims and attaches to request.
 *
 * Environment Variables:
 * - AUTH_DISABLED: Set to 'true' to bypass authentication (development only)
 * - AUTH0_DOMAIN: Your Auth0 tenant domain (e.g., 'your-tenant.auth0.com')
 * - AUTH0_AUDIENCE: Your API identifier in Auth0
 */

import { Request, Response, NextFunction } from 'express';
import { auth, requiredScopes, claimCheck, JWTPayload } from 'express-oauth2-jwt-bearer';

// ============================================================================
// Types
// ============================================================================

/**
 * Represents an authenticated user in the system
 */
export interface User {
  id: string;
  email: string;
}

/**
 * Extend Express Request to include the authenticated user
 * Note: express-oauth2-jwt-bearer already adds req.auth with the JWT payload
 */
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

// ============================================================================
// Configuration
// ============================================================================

const AUTH_DISABLED = process.env.AUTH_DISABLED === 'true';
const AUTH0_DOMAIN = process.env.AUTH0_DOMAIN;
const AUTH0_AUDIENCE = process.env.AUTH0_AUDIENCE;

// ============================================================================
// Auth0 JWT Validator
// ============================================================================

/**
 * Auth0 JWT validation middleware
 * Only initialized when auth is enabled and credentials are configured
 */
const jwtCheck = !AUTH_DISABLED && AUTH0_DOMAIN && AUTH0_AUDIENCE
  ? auth({
      issuerBaseURL: `https://${AUTH0_DOMAIN}`,
      audience: AUTH0_AUDIENCE,
    })
  : null;

// ============================================================================
// Middleware
// ============================================================================

/**
 * Development mock user for when AUTH_DISABLED=true
 */
const MOCK_USER: User = {
  id: 'dev-user',
  email: 'dev@local',
};

/**
 * Extract user information from Auth0 JWT payload
 * Auth0 stores email in different places depending on configuration:
 * 1. Standard 'email' claim (if email scope requested)
 * 2. Custom namespaced claim (for custom rules/actions)
 * 3. The 'sub' claim always contains the user ID
 */
function extractUserFromPayload(payload: JWTPayload): User {
  const email =
    (payload.email as string) ||
    (payload['https://resume-builder.app/email'] as string) ||
    `${payload.sub}@auth0.user`;

  return {
    id: payload.sub as string,
    email,
  };
}

/**
 * Authenticate incoming requests and attach user to request object.
 *
 * When AUTH_DISABLED=true: Creates a mock user for development.
 * When AUTH_DISABLED=false: Validates JWT token from Authorization header.
 */
export const authenticateRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Development bypass - mock user when AUTH_DISABLED=true
  if (AUTH_DISABLED) {
    req.user = MOCK_USER;
    next();
    return;
  }

  // Check if Auth0 is properly configured
  if (!jwtCheck) {
    console.error(
      'Auth0 not configured. Set AUTH0_DOMAIN and AUTH0_AUDIENCE environment variables, ' +
      'or set AUTH_DISABLED=true for development.'
    );
    res.status(500).json({
      error: 'Authentication not configured',
      message: 'Server authentication is not properly configured',
    });
    return;
  }

  // Validate JWT token using Auth0 middleware
  jwtCheck(req, res, (err?: unknown) => {
    if (err) {
      // Auth0 middleware handles 401 responses for invalid tokens
      // This catches any other errors
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      console.error('JWT validation error:', errorMessage);
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid or expired token',
      });
      return;
    }

    // Extract user from validated token payload
    // express-oauth2-jwt-bearer adds req.auth.payload after validation
    const payload = req.auth?.payload;
    if (payload?.sub) {
      req.user = extractUserFromPayload(payload);
    } else {
      // This shouldn't happen if jwtCheck passed, but handle defensively
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Token payload not found',
      });
      return;
    }

    next();
  });
};

/**
 * Middleware to require specific scopes on a route
 * Usage: app.get('/admin', authenticateRequest, requireScopes('admin:read'), handler)
 */
export const requireScopes = requiredScopes;

/**
 * Middleware to check custom claims
 * Usage: app.get('/premium', authenticateRequest, requireClaim('premium', true), handler)
 */
export const requireClaim = claimCheck;

/**
 * Legacy export for backwards compatibility
 * @deprecated Use authenticateRequest instead
 */
export const authMiddleware = authenticateRequest;

export default authenticateRequest;
