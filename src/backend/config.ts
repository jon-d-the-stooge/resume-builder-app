/**
 * Environment Configuration
 *
 * Loads and validates environment variables, providing a typed configuration object.
 * Fails fast on missing required variables to prevent runtime errors.
 *
 * Usage:
 *   import { config } from './config';
 *   console.log(config.server.port);
 */

import 'dotenv/config';

// =============================================================================
// Types
// =============================================================================

export type AuthProvider = 'auth0' | 'clerk' | 'supabase' | 'none';
export type LLMProviderType = 'anthropic' | 'openai';
export type NodeEnv = 'development' | 'production' | 'test';

export interface ServerConfig {
  port: number;
  nodeEnv: NodeEnv;
  isDevelopment: boolean;
  isProduction: boolean;
  isTest: boolean;
}

export interface DatabaseConfig {
  /** SQLite file path (used when DATABASE_URL is not set) */
  path: string;
  /** Full database connection URL (PostgreSQL, MySQL, etc.) */
  url: string | null;
  /** Data directory for persistent storage */
  dataDir: string;
}

export interface Auth0Config {
  domain: string;
  audience: string;
  clientId: string;
  clientSecret: string;
}

export interface ClerkConfig {
  secretKey: string;
  publishableKey: string;
}

export interface SupabaseConfig {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
}

export interface AuthConfig {
  provider: AuthProvider;
  disabled: boolean;
  auth0: Auth0Config;
  clerk: ClerkConfig;
  supabase: SupabaseConfig;
}

export interface LLMConfig {
  provider: LLMProviderType;
  anthropicApiKey: string;
  openaiApiKey: string;
  hasAnthropicKey: boolean;
  hasOpenaiKey: boolean;
}

export interface ExternalApisConfig {
  rapidApiKey: string;
  adzunaAppId: string;
  adzunaApiKey: string;
  hasRapidApiKey: boolean;
  hasAdzunaKey: boolean;
}

export interface CorsConfig {
  frontendUrl: string;
  origins: string[];
}

export interface RateLimitConfig {
  requestsPerDay: number;
  tokensPerDay: number;
}

export interface AdminConfig {
  secret: string;
  hasSecret: boolean;
}

export interface Config {
  server: ServerConfig;
  database: DatabaseConfig;
  auth: AuthConfig;
  llm: LLMConfig;
  externalApis: ExternalApisConfig;
  cors: CorsConfig;
  rateLimit: RateLimitConfig;
  admin: AdminConfig;
}

// =============================================================================
// Validation Helpers
// =============================================================================

class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

/**
 * Get an environment variable, throwing if required and not set
 */
function getEnv(key: string, required: false): string;
function getEnv(key: string, required: true): string;
function getEnv(key: string, required: boolean = false): string {
  const value = process.env[key] || '';
  if (required && !value) {
    throw new ConfigurationError(
      `Missing required environment variable: ${key}. ` +
      `Please set it in your .env file or environment.`
    );
  }
  return value;
}

/**
 * Get an environment variable with a default value
 */
function getEnvWithDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Get a numeric environment variable
 */
function getEnvNumber(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new ConfigurationError(
      `Invalid numeric value for ${key}: "${value}". Expected a number.`
    );
  }
  return parsed;
}

/**
 * Get a boolean environment variable
 */
function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse CORS origins from comma-separated string
 */
function parseCorsOrigins(value: string): string[] {
  if (!value) return [];
  return value.split(',').map(origin => origin.trim()).filter(Boolean);
}

/**
 * Validate auth provider value
 */
function parseAuthProvider(value: string): AuthProvider {
  const valid: AuthProvider[] = ['auth0', 'clerk', 'supabase', 'none'];
  if (valid.includes(value as AuthProvider)) {
    return value as AuthProvider;
  }
  return 'auth0'; // default
}

/**
 * Validate LLM provider value
 */
function parseLLMProvider(value: string): LLMProviderType {
  if (value === 'openai') return 'openai';
  return 'anthropic'; // default
}

/**
 * Validate node environment
 */
function parseNodeEnv(value: string): NodeEnv {
  const valid: NodeEnv[] = ['development', 'production', 'test'];
  if (valid.includes(value as NodeEnv)) {
    return value as NodeEnv;
  }
  return 'development'; // default
}

// =============================================================================
// Configuration Loader
// =============================================================================

function loadConfig(): Config {
  const nodeEnv = parseNodeEnv(getEnvWithDefault('NODE_ENV', 'development'));
  const authDisabled = getEnvBoolean('AUTH_DISABLED', false);

  // Load LLM keys
  const anthropicApiKey = getEnv('ANTHROPIC_API_KEY', false);
  const openaiApiKey = getEnv('OPENAI_API_KEY', false);
  const hasAnthropicKey = !!anthropicApiKey;
  const hasOpenaiKey = !!openaiApiKey;

  // Determine LLM provider - default to anthropic if key exists
  let llmProvider = parseLLMProvider(getEnvWithDefault('LLM_PROVIDER', 'anthropic'));
  if (llmProvider === 'anthropic' && !hasAnthropicKey && hasOpenaiKey) {
    llmProvider = 'openai';
  }

  // Load external API keys
  const rapidApiKey = getEnv('RAPIDAPI_KEY', false);
  const adzunaAppId = getEnv('ADZUNA_APP_ID', false);
  const adzunaApiKey = getEnv('ADZUNA_API_KEY', false);

  // Admin secret
  const adminSecret = getEnv('ADMIN_SECRET', false);

  const config: Config = {
    server: {
      port: getEnvNumber('PORT', 3001),
      nodeEnv,
      isDevelopment: nodeEnv === 'development',
      isProduction: nodeEnv === 'production',
      isTest: nodeEnv === 'test',
    },

    database: {
      path: getEnvWithDefault('DATABASE_PATH', './data/local.db'),
      url: getEnv('DATABASE_URL', false) || null,
      dataDir: getEnvWithDefault('DATA_DIR', './data'),
    },

    auth: {
      provider: parseAuthProvider(getEnvWithDefault('AUTH_PROVIDER', 'auth0')),
      disabled: authDisabled,
      auth0: {
        domain: getEnv('AUTH0_DOMAIN', false),
        audience: getEnv('AUTH0_AUDIENCE', false),
        clientId: getEnv('AUTH0_CLIENT_ID', false),
        clientSecret: getEnv('AUTH0_CLIENT_SECRET', false),
      },
      clerk: {
        secretKey: getEnv('CLERK_SECRET_KEY', false),
        publishableKey: getEnv('CLERK_PUBLISHABLE_KEY', false),
      },
      supabase: {
        url: getEnv('SUPABASE_URL', false),
        anonKey: getEnv('SUPABASE_ANON_KEY', false),
        serviceRoleKey: getEnv('SUPABASE_SERVICE_ROLE_KEY', false),
      },
    },

    llm: {
      provider: llmProvider,
      anthropicApiKey,
      openaiApiKey,
      hasAnthropicKey,
      hasOpenaiKey,
    },

    externalApis: {
      rapidApiKey,
      adzunaAppId,
      adzunaApiKey,
      hasRapidApiKey: !!rapidApiKey,
      hasAdzunaKey: !!(adzunaAppId && adzunaApiKey),
    },

    cors: {
      frontendUrl: getEnvWithDefault('FRONTEND_URL', 'http://localhost:5173'),
      origins: parseCorsOrigins(
        getEnvWithDefault('CORS_ORIGINS', 'http://localhost:5173,http://localhost:3000')
      ),
    },

    rateLimit: {
      requestsPerDay: getEnvNumber('RATE_LIMIT_REQUESTS_PER_DAY', 100),
      tokensPerDay: getEnvNumber('RATE_LIMIT_TOKENS_PER_DAY', 100000),
    },

    admin: {
      secret: adminSecret,
      hasSecret: !!adminSecret,
    },
  };

  return config;
}

// =============================================================================
// Validation
// =============================================================================

/**
 * Validate configuration for production readiness
 * Throws ConfigurationError if critical settings are missing
 */
function validateConfig(config: Config): void {
  const errors: string[] = [];

  // In production, auth must be properly configured
  if (config.server.isProduction) {
    if (config.auth.disabled) {
      errors.push('AUTH_DISABLED cannot be true in production');
    }

    if (config.auth.provider === 'auth0') {
      if (!config.auth.auth0.domain) errors.push('AUTH0_DOMAIN is required for Auth0');
      if (!config.auth.auth0.audience) errors.push('AUTH0_AUDIENCE is required for Auth0');
    } else if (config.auth.provider === 'clerk') {
      if (!config.auth.clerk.secretKey) errors.push('CLERK_SECRET_KEY is required for Clerk');
    } else if (config.auth.provider === 'supabase') {
      if (!config.auth.supabase.url) errors.push('SUPABASE_URL is required for Supabase');
      if (!config.auth.supabase.anonKey) errors.push('SUPABASE_ANON_KEY is required for Supabase');
    }
  }

  // Require at least one LLM API key
  if (!config.llm.hasAnthropicKey && !config.llm.hasOpenaiKey) {
    errors.push(
      'At least one LLM API key is required (ANTHROPIC_API_KEY or OPENAI_API_KEY)'
    );
  }

  if (errors.length > 0) {
    throw new ConfigurationError(
      'Configuration validation failed:\n' +
      errors.map(e => `  - ${e}`).join('\n')
    );
  }
}

// =============================================================================
// Export
// =============================================================================

/**
 * Application configuration loaded from environment variables.
 * Validated at import time - will throw if required variables are missing.
 */
export const config: Config = loadConfig();

// Validate configuration (throws on critical errors in production)
validateConfig(config);

/**
 * Re-export the ConfigurationError for consumers
 */
export { ConfigurationError };

/**
 * Helper to check if a specific auth provider is properly configured
 */
export function isAuthProviderConfigured(provider: AuthProvider): boolean {
  switch (provider) {
    case 'auth0':
      return !!(config.auth.auth0.domain && config.auth.auth0.audience);
    case 'clerk':
      return !!config.auth.clerk.secretKey;
    case 'supabase':
      return !!(config.auth.supabase.url && config.auth.supabase.anonKey);
    case 'none':
      return true;
    default:
      return false;
  }
}

/**
 * Get the active database connection string
 * Returns DATABASE_URL if set, otherwise constructs SQLite path
 */
export function getDatabaseConnectionString(): string {
  if (config.database.url) {
    return config.database.url;
  }
  return `sqlite:${config.database.path}`;
}
