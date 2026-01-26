/**
 * Usage Tracker Service
 *
 * Tracks API usage (LLM tokens, RapidAPI requests) in a SQLite database.
 * Provides methods for recording usage and querying historical data.
 * Integrates with LLMProxy and RapidAPIProxy for automatic tracking.
 */

import Database = require('better-sqlite3');
import * as path from 'path';
import * as fs from 'fs';

// ============================================================================
// Type Definitions
// ============================================================================

export type ServiceType = 'anthropic' | 'openai' | 'rapidapi';

export interface UsageRecord {
  id: number;
  userId: string;
  service: ServiceType;
  endpoint: string | null;
  tokensUsed: number | null;
  requestCount: number;
  createdAt: string;
}

export interface UsageSummary {
  service: ServiceType;
  totalRequests: number;
  totalTokens: number;
  uniqueEndpoints: number;
}

export interface UserUsageSummary {
  userId: string;
  services: UsageSummary[];
  totalRequests: number;
  totalTokens: number;
  firstRequest: string | null;
  lastRequest: string | null;
}

export interface AdminUsageSummary {
  totalRequests: number;
  totalTokens: number;
  uniqueUsers: number;
  byService: UsageSummary[];
  recentActivity: UsageRecord[];
}

// ============================================================================
// Database Setup
// ============================================================================

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), 'data');
const DB_PATH = path.join(DATA_DIR, 'usage.db');

let db: Database.Database | null = null;

/**
 * Ensure the data directory exists
 */
function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    console.log(`[UsageTracker] Created data directory: ${DATA_DIR}`);
  }
}

/**
 * Initialize the SQLite database and create tables
 */
function initializeDatabase(): Database.Database {
  if (db) {
    return db;
  }

  ensureDataDir();

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');

  // Create the api_usage table
  db.exec(`
    CREATE TABLE IF NOT EXISTS api_usage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      service TEXT NOT NULL,
      endpoint TEXT,
      tokens_used INTEGER,
      request_count INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_api_usage_user_id ON api_usage(user_id);
    CREATE INDEX IF NOT EXISTS idx_api_usage_service ON api_usage(service);
    CREATE INDEX IF NOT EXISTS idx_api_usage_created_at ON api_usage(created_at);
  `);

  console.log(`[UsageTracker] Database initialized at ${DB_PATH}`);
  return db;
}

/**
 * Get the database instance, initializing if necessary
 */
function getDb(): Database.Database {
  if (!db) {
    return initializeDatabase();
  }
  return db;
}

// ============================================================================
// Exported API
// ============================================================================

export const usageTracker = {
  /**
   * Track an API usage event
   *
   * @param userId - The user making the request (use 'anonymous' for unauthenticated)
   * @param service - The service being called ('anthropic', 'openai', 'rapidapi')
   * @param endpoint - Optional endpoint or model name
   * @param tokens - Optional token count (for LLM calls)
   */
  trackUsage(
    userId: string,
    service: ServiceType,
    endpoint?: string,
    tokens?: number
  ): void {
    const database = getDb();

    const stmt = database.prepare(`
      INSERT INTO api_usage (user_id, service, endpoint, tokens_used, request_count)
      VALUES (?, ?, ?, ?, 1)
    `);

    stmt.run(userId, service, endpoint || null, tokens || null);

    console.log(
      `[UsageTracker] Tracked: user=${userId} service=${service} ` +
        `endpoint=${endpoint || 'N/A'} tokens=${tokens || 'N/A'}`
    );
  },

  /**
   * Get usage statistics for a specific user since a given date
   *
   * @param userId - The user to query
   * @param since - Start date for the query
   */
  getUsageForUser(userId: string, since: Date): UserUsageSummary {
    const database = getDb();
    const sinceStr = since.toISOString();

    // Get aggregated stats by service
    const serviceStats = database
      .prepare(
        `
      SELECT
        service,
        SUM(request_count) as total_requests,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COUNT(DISTINCT endpoint) as unique_endpoints
      FROM api_usage
      WHERE user_id = ? AND created_at >= ?
      GROUP BY service
    `
      )
      .all(userId, sinceStr) as Array<{
      service: ServiceType;
      total_requests: number;
      total_tokens: number;
      unique_endpoints: number;
    }>;

    // Get overall totals and date range
    const totals = database
      .prepare(
        `
      SELECT
        SUM(request_count) as total_requests,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        MIN(created_at) as first_request,
        MAX(created_at) as last_request
      FROM api_usage
      WHERE user_id = ? AND created_at >= ?
    `
      )
      .get(userId, sinceStr) as {
      total_requests: number | null;
      total_tokens: number | null;
      first_request: string | null;
      last_request: string | null;
    };

    return {
      userId,
      services: serviceStats.map((s) => ({
        service: s.service,
        totalRequests: s.total_requests,
        totalTokens: s.total_tokens,
        uniqueEndpoints: s.unique_endpoints,
      })),
      totalRequests: totals.total_requests || 0,
      totalTokens: totals.total_tokens || 0,
      firstRequest: totals.first_request,
      lastRequest: totals.last_request,
    };
  },

  /**
   * Get total usage across all users since a given date (for admin monitoring)
   *
   * @param since - Start date for the query
   */
  getTotalUsage(since: Date): AdminUsageSummary {
    const database = getDb();
    const sinceStr = since.toISOString();

    // Get aggregated stats by service
    const serviceStats = database
      .prepare(
        `
      SELECT
        service,
        SUM(request_count) as total_requests,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COUNT(DISTINCT endpoint) as unique_endpoints
      FROM api_usage
      WHERE created_at >= ?
      GROUP BY service
    `
      )
      .all(sinceStr) as Array<{
      service: ServiceType;
      total_requests: number;
      total_tokens: number;
      unique_endpoints: number;
    }>;

    // Get overall totals
    const totals = database
      .prepare(
        `
      SELECT
        SUM(request_count) as total_requests,
        COALESCE(SUM(tokens_used), 0) as total_tokens,
        COUNT(DISTINCT user_id) as unique_users
      FROM api_usage
      WHERE created_at >= ?
    `
      )
      .get(sinceStr) as {
      total_requests: number | null;
      total_tokens: number | null;
      unique_users: number;
    };

    // Get recent activity (last 50 records)
    const recentActivity = database
      .prepare(
        `
      SELECT id, user_id, service, endpoint, tokens_used, request_count, created_at
      FROM api_usage
      WHERE created_at >= ?
      ORDER BY created_at DESC
      LIMIT 50
    `
      )
      .all(sinceStr) as Array<{
      id: number;
      user_id: string;
      service: ServiceType;
      endpoint: string | null;
      tokens_used: number | null;
      request_count: number;
      created_at: string;
    }>;

    return {
      totalRequests: totals.total_requests || 0,
      totalTokens: totals.total_tokens || 0,
      uniqueUsers: totals.unique_users,
      byService: serviceStats.map((s) => ({
        service: s.service,
        totalRequests: s.total_requests,
        totalTokens: s.total_tokens,
        uniqueEndpoints: s.unique_endpoints,
      })),
      recentActivity: recentActivity.map((r) => ({
        id: r.id,
        userId: r.user_id,
        service: r.service,
        endpoint: r.endpoint,
        tokensUsed: r.tokens_used,
        requestCount: r.request_count,
        createdAt: r.created_at,
      })),
    };
  },

  /**
   * Get usage grouped by day for a time range
   *
   * @param since - Start date
   * @param until - End date (defaults to now)
   */
  getDailyUsage(
    since: Date,
    until?: Date
  ): Array<{
    date: string;
    service: ServiceType;
    requests: number;
    tokens: number;
  }> {
    const database = getDb();
    const sinceStr = since.toISOString();
    const untilStr = (until || new Date()).toISOString();

    const results = database
      .prepare(
        `
      SELECT
        DATE(created_at) as date,
        service,
        SUM(request_count) as requests,
        COALESCE(SUM(tokens_used), 0) as tokens
      FROM api_usage
      WHERE created_at >= ? AND created_at <= ?
      GROUP BY DATE(created_at), service
      ORDER BY date DESC, service
    `
      )
      .all(sinceStr, untilStr) as Array<{
      date: string;
      service: ServiceType;
      requests: number;
      tokens: number;
    }>;

    return results;
  },

  /**
   * Close the database connection (for graceful shutdown)
   */
  close(): void {
    if (db) {
      db.close();
      db = null;
      console.log('[UsageTracker] Database connection closed');
    }
  },
};

export default usageTracker;
