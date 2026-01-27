/**
 * Database Storage Provider
 *
 * SQLite-based implementation of StorageProvider for multi-tenant support.
 * Uses better-sqlite3 for synchronous, performant database operations.
 *
 * Schema:
 *   files(id, user_id, path, content, created_at, updated_at)
 *   UNIQUE(user_id, path)
 *
 * Directory semantics are emulated through path prefixes.
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import { ExtendedStorageProvider, StorageEntry } from './interface';

// ============================================================================
// Types
// ============================================================================

/**
 * Configuration options for DatabaseStorage
 */
export interface DatabaseStorageOptions {
  /**
   * Path to the SQLite database file
   * Use ':memory:' for an in-memory database (useful for testing)
   */
  databasePath: string;

  /**
   * User ID for multi-tenant isolation
   * All operations are scoped to this user
   */
  userId: string;

  /**
   * Whether to enable WAL mode for better concurrent performance
   * Default: true
   */
  walMode?: boolean;
}

/**
 * Row structure from the files table
 */
interface FileRow {
  id: number;
  user_id: string;
  path: string;
  content: string;
  is_directory: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Schema Migration
// ============================================================================

const SCHEMA_VERSION = 1;

const MIGRATIONS: Record<number, string[]> = {
  1: [
    `CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY
    )`,
    `CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      is_directory INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, path)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_files_user_path ON files(user_id, path)`,
    `CREATE INDEX IF NOT EXISTS idx_files_user_parent ON files(user_id, path)`,
  ],
};

// ============================================================================
// Database Storage Implementation
// ============================================================================

/**
 * SQLite-based storage provider with multi-tenant support
 *
 * Each user's files are isolated by user_id. Directory operations
 * are emulated through path prefix queries.
 */
export class DatabaseStorage implements ExtendedStorageProvider {
  private db: Database.Database;
  private userId: string;

  // Prepared statements for performance
  private stmtRead!: Database.Statement;
  private stmtWrite!: Database.Statement;
  private stmtUpdate!: Database.Statement;
  private stmtDelete!: Database.Statement;
  private stmtExists!: Database.Statement;
  private stmtList!: Database.Statement;
  private stmtListDirs!: Database.Statement;

  constructor(options: DatabaseStorageOptions) {
    this.userId = options.userId;

    // Initialize database
    this.db = new Database(options.databasePath);

    // Enable WAL mode for better performance (unless disabled)
    if (options.walMode !== false) {
      this.db.pragma('journal_mode = WAL');
    }

    // Run migrations
    this.runMigrations();

    // Prepare statements
    this.prepareStatements();
  }

  /**
   * Run database migrations
   */
  private runMigrations(): void {
    // Get current version
    let currentVersion = 0;
    try {
      const row = this.db
        .prepare('SELECT version FROM schema_version ORDER BY version DESC LIMIT 1')
        .get() as { version: number } | undefined;
      currentVersion = row?.version || 0;
    } catch {
      // Table doesn't exist yet, version is 0
    }

    // Run migrations up to SCHEMA_VERSION
    for (let v = currentVersion + 1; v <= SCHEMA_VERSION; v++) {
      const statements = MIGRATIONS[v];
      if (statements) {
        const transaction = this.db.transaction(() => {
          for (const sql of statements) {
            this.db.exec(sql);
          }
          this.db.prepare('INSERT OR REPLACE INTO schema_version (version) VALUES (?)').run(v);
        });
        transaction();
        console.log(`[DatabaseStorage] Migrated to schema version ${v}`);
      }
    }
  }

  /**
   * Prepare SQL statements for reuse
   */
  private prepareStatements(): void {
    this.stmtRead = this.db.prepare(
      'SELECT content FROM files WHERE user_id = ? AND path = ? AND is_directory = 0'
    );

    this.stmtWrite = this.db.prepare(`
      INSERT INTO files (user_id, path, content, is_directory, created_at, updated_at)
      VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id, path) DO UPDATE SET
        content = excluded.content,
        updated_at = CURRENT_TIMESTAMP
    `);

    this.stmtUpdate = this.db.prepare(`
      UPDATE files SET content = ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND path = ?
    `);

    this.stmtDelete = this.db.prepare('DELETE FROM files WHERE user_id = ? AND path = ?');

    this.stmtExists = this.db.prepare('SELECT 1 FROM files WHERE user_id = ? AND path = ?');

    // List files in a directory (immediate children only)
    this.stmtList = this.db.prepare(`
      SELECT path, is_directory FROM files
      WHERE user_id = ? AND path LIKE ? AND path NOT LIKE ?
    `);

    this.stmtListDirs = this.db.prepare(`
      SELECT DISTINCT
        CASE
          WHEN INSTR(SUBSTR(path, ?), '/') > 0
          THEN SUBSTR(path, ?, INSTR(SUBSTR(path, ?), '/') - 1)
          ELSE SUBSTR(path, ?)
        END as name,
        path,
        is_directory
      FROM files
      WHERE user_id = ? AND path LIKE ?
    `);
  }

  /**
   * Normalize a path for consistent storage
   */
  private normalizePath(filePath: string): string {
    // Remove leading/trailing slashes, normalize separators
    let normalized = path.normalize(filePath).replace(/^\/+|\/+$/g, '');
    // Handle root directory
    if (normalized === '' || normalized === '.') {
      return '';
    }
    return normalized;
  }

  /**
   * Get the parent directory of a path
   */
  private getParentPath(filePath: string): string {
    const normalized = this.normalizePath(filePath);
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash > 0 ? normalized.substring(0, lastSlash) : '';
  }

  /**
   * Extract filename from path
   */
  private getFileName(filePath: string): string {
    const normalized = this.normalizePath(filePath);
    const lastSlash = normalized.lastIndexOf('/');
    return lastSlash >= 0 ? normalized.substring(lastSlash + 1) : normalized;
  }

  /**
   * Ensure parent directories exist (as directory markers)
   */
  private ensureParentDirs(filePath: string): void {
    const normalized = this.normalizePath(filePath);
    const parts = normalized.split('/');

    // Remove the file name, keep directories
    parts.pop();

    let currentPath = '';
    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      // Insert directory marker if it doesn't exist
      this.db.prepare(`
        INSERT OR IGNORE INTO files (user_id, path, content, is_directory, created_at, updated_at)
        VALUES (?, ?, '', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).run(this.userId, currentPath);
    }
  }

  // ============================================================================
  // StorageProvider Implementation
  // ============================================================================

  async read(filePath: string): Promise<string> {
    const normalized = this.normalizePath(filePath);
    const row = this.stmtRead.get(this.userId, normalized) as { content: string } | undefined;

    if (!row) {
      throw new Error(`ENOENT: no such file: ${filePath}`);
    }

    return row.content;
  }

  async write(filePath: string, content: string): Promise<void> {
    const normalized = this.normalizePath(filePath);

    // Ensure parent directories exist
    this.ensureParentDirs(normalized);

    // Write the file
    this.stmtWrite.run(this.userId, normalized, content);
  }

  async delete(filePath: string): Promise<void> {
    const normalized = this.normalizePath(filePath);

    // Check if it's a directory
    const row = this.db
      .prepare('SELECT is_directory FROM files WHERE user_id = ? AND path = ?')
      .get(this.userId, normalized) as { is_directory: number } | undefined;

    if (!row) {
      throw new Error(`ENOENT: no such file or directory: ${filePath}`);
    }

    if (row.is_directory) {
      // Delete directory and all children
      this.db
        .prepare('DELETE FROM files WHERE user_id = ? AND (path = ? OR path LIKE ?)')
        .run(this.userId, normalized, `${normalized}/%`);
    } else {
      // Delete single file
      const result = this.stmtDelete.run(this.userId, normalized);
      if (result.changes === 0) {
        throw new Error(`ENOENT: no such file: ${filePath}`);
      }
    }
  }

  async list(directory: string): Promise<string[]> {
    const normalized = this.normalizePath(directory);
    const prefix = normalized ? `${normalized}/` : '';

    // Find all files/dirs under this path
    const rows = this.db
      .prepare(`
        SELECT DISTINCT path FROM files
        WHERE user_id = ? AND path LIKE ?
      `)
      .all(this.userId, `${prefix}%`) as { path: string }[];

    // Extract immediate children only
    const entries = new Set<string>();
    for (const row of rows) {
      const relativePath = row.path.substring(prefix.length);
      const firstSlash = relativePath.indexOf('/');
      const entryName = firstSlash >= 0 ? relativePath.substring(0, firstSlash) : relativePath;
      if (entryName) {
        entries.add(entryName);
      }
    }

    // If directory doesn't exist and has no children, throw
    if (entries.size === 0 && normalized) {
      const dirExists = this.stmtExists.get(this.userId, normalized);
      if (!dirExists) {
        throw new Error(`ENOENT: no such directory: ${directory}`);
      }
    }

    return Array.from(entries).sort();
  }

  async exists(filePath: string): Promise<boolean> {
    const normalized = this.normalizePath(filePath);

    // Check for exact match
    const row = this.stmtExists.get(this.userId, normalized);
    if (row) return true;

    // Check if it's a "virtual" directory (has children but no explicit entry)
    if (normalized) {
      const childExists = this.db
        .prepare('SELECT 1 FROM files WHERE user_id = ? AND path LIKE ? LIMIT 1')
        .get(this.userId, `${normalized}/%`);
      return !!childExists;
    }

    // Root always exists
    return true;
  }

  // ============================================================================
  // ExtendedStorageProvider Implementation
  // ============================================================================

  async listWithMetadata(directory: string): Promise<StorageEntry[]> {
    const normalized = this.normalizePath(directory);
    const prefix = normalized ? `${normalized}/` : '';

    // Get all files/dirs under this path
    const rows = this.db
      .prepare(`
        SELECT path, is_directory FROM files
        WHERE user_id = ? AND path LIKE ?
      `)
      .all(this.userId, `${prefix}%`) as FileRow[];

    // Build entries for immediate children
    const entriesMap = new Map<string, StorageEntry>();

    for (const row of rows) {
      const relativePath = row.path.substring(prefix.length);
      const firstSlash = relativePath.indexOf('/');
      const entryName = firstSlash >= 0 ? relativePath.substring(0, firstSlash) : relativePath;

      if (entryName && !entriesMap.has(entryName)) {
        const isDir = firstSlash >= 0 || row.is_directory === 1;
        entriesMap.set(entryName, {
          name: entryName,
          path: prefix + entryName,
          isDirectory: isDir,
        });
      }
    }

    return Array.from(entriesMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  }

  async mkdir(dirPath: string): Promise<void> {
    const normalized = this.normalizePath(dirPath);
    if (!normalized) return; // Root always exists

    // Create all parent directories
    const parts = normalized.split('/');
    let currentPath = '';

    for (const part of parts) {
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      this.db
        .prepare(`
          INSERT OR IGNORE INTO files (user_id, path, content, is_directory, created_at, updated_at)
          VALUES (?, ?, '', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `)
        .run(this.userId, currentPath);
    }
  }

  async copy(source: string, destination: string): Promise<void> {
    const content = await this.read(source);
    await this.write(destination, content);
  }

  async move(source: string, destination: string): Promise<void> {
    const normalizedSrc = this.normalizePath(source);
    const normalizedDest = this.normalizePath(destination);

    // Check if source is a directory
    const srcRow = this.db
      .prepare('SELECT is_directory FROM files WHERE user_id = ? AND path = ?')
      .get(this.userId, normalizedSrc) as { is_directory: number } | undefined;

    if (!srcRow) {
      throw new Error(`ENOENT: no such file or directory: ${source}`);
    }

    // Ensure destination parent exists
    this.ensureParentDirs(normalizedDest);

    if (srcRow.is_directory) {
      // Move directory and all children
      const transaction = this.db.transaction(() => {
        // Update all paths that start with source
        const children = this.db
          .prepare('SELECT id, path FROM files WHERE user_id = ? AND path LIKE ?')
          .all(this.userId, `${normalizedSrc}/%`) as { id: number; path: string }[];

        for (const child of children) {
          const newPath = normalizedDest + child.path.substring(normalizedSrc.length);
          this.db
            .prepare('UPDATE files SET path = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newPath, child.id);
        }

        // Update the directory itself
        this.db
          .prepare('UPDATE files SET path = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND path = ?')
          .run(normalizedDest, this.userId, normalizedSrc);
      });
      transaction();
    } else {
      // Move single file
      this.db
        .prepare('UPDATE files SET path = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND path = ?')
        .run(normalizedDest, this.userId, normalizedSrc);
    }
  }

  // ============================================================================
  // Additional Methods
  // ============================================================================

  /**
   * Get the current user ID
   */
  getUserId(): string {
    return this.userId;
  }

  /**
   * Create a new DatabaseStorage instance for a different user
   * Shares the same database connection
   */
  forUser(userId: string): DatabaseStorage {
    const storage = Object.create(DatabaseStorage.prototype) as DatabaseStorage;
    storage.db = this.db;
    storage.userId = userId;
    storage.stmtRead = this.stmtRead;
    storage.stmtWrite = this.stmtWrite;
    storage.stmtUpdate = this.stmtUpdate;
    storage.stmtDelete = this.stmtDelete;
    storage.stmtExists = this.stmtExists;
    storage.stmtList = this.stmtList;
    storage.stmtListDirs = this.stmtListDirs;
    return storage;
  }

  /**
   * Close the database connection
   */
  close(): void {
    this.db.close();
  }

  /**
   * Get storage statistics for the current user
   */
  getStats(): { fileCount: number; totalSize: number; directoryCount: number } {
    const stats = this.db
      .prepare(`
        SELECT
          SUM(CASE WHEN is_directory = 0 THEN 1 ELSE 0 END) as file_count,
          SUM(CASE WHEN is_directory = 0 THEN LENGTH(content) ELSE 0 END) as total_size,
          SUM(CASE WHEN is_directory = 1 THEN 1 ELSE 0 END) as dir_count
        FROM files
        WHERE user_id = ?
      `)
      .get(this.userId) as { file_count: number; total_size: number; dir_count: number };

    return {
      fileCount: stats.file_count || 0,
      totalSize: stats.total_size || 0,
      directoryCount: stats.dir_count || 0,
    };
  }

  /**
   * Clear all data for the current user (useful for testing)
   */
  clear(): void {
    this.db.prepare('DELETE FROM files WHERE user_id = ?').run(this.userId);
  }

  /**
   * Dump all files for the current user (useful for debugging)
   */
  dump(): Record<string, string> {
    const rows = this.db
      .prepare('SELECT path, content FROM files WHERE user_id = ? AND is_directory = 0')
      .all(this.userId) as { path: string; content: string }[];

    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.path] = row.content;
    }
    return result;
  }
}
