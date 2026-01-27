/**
 * Storage Provider Interface
 *
 * Platform-agnostic abstraction for file storage operations.
 * Enables swapping between different storage backends:
 * - FileStorage: Node.js fs-based (Electron/local development)
 * - MemoryStorage: In-memory (testing)
 * - Future: DatabaseStorage, CloudStorage, etc.
 */

/**
 * Result of a storage operation that may fail gracefully
 */
export interface StorageResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/**
 * File/directory entry metadata
 */
export interface StorageEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

/**
 * Abstract storage provider interface
 *
 * All paths are relative to the storage root (implementation-specific).
 * Implementations should handle path normalization internally.
 */
export interface StorageProvider {
  /**
   * Read file contents as string
   * @param path - Relative path to the file
   * @returns File contents as string
   * @throws If file does not exist or cannot be read
   */
  read(path: string): Promise<string>;

  /**
   * Write content to a file
   * Creates parent directories if they don't exist
   * @param path - Relative path to the file
   * @param content - String content to write
   */
  write(path: string, content: string): Promise<void>;

  /**
   * Delete a file or directory
   * @param path - Relative path to delete
   * @throws If path does not exist
   */
  delete(path: string): Promise<void>;

  /**
   * List entries in a directory
   * @param directory - Relative path to directory
   * @returns Array of entry names in the directory
   */
  list(directory: string): Promise<string[]>;

  /**
   * Check if a path exists
   * @param path - Relative path to check
   * @returns True if path exists
   */
  exists(path: string): Promise<boolean>;
}

/**
 * Extended storage provider with additional utility methods
 */
export interface ExtendedStorageProvider extends StorageProvider {
  /**
   * List entries with full metadata
   * @param directory - Relative path to directory
   * @returns Array of StorageEntry objects
   */
  listWithMetadata(directory: string): Promise<StorageEntry[]>;

  /**
   * Create a directory (and parent directories)
   * @param path - Relative path to directory
   */
  mkdir(path: string): Promise<void>;

  /**
   * Copy a file
   * @param source - Source path
   * @param destination - Destination path
   */
  copy(source: string, destination: string): Promise<void>;

  /**
   * Move/rename a file
   * @param source - Source path
   * @param destination - Destination path
   */
  move(source: string, destination: string): Promise<void>;
}
