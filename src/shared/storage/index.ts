/**
 * Storage Module
 *
 * Platform-agnostic storage abstraction for file operations.
 * Supports multiple backends: filesystem, memory (testing), database, and future cloud.
 */

export * from './interface';
export * from './fileStorage';
export * from './memoryStorage';
export * from './databaseStorage';
