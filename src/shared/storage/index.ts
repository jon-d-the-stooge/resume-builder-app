/**
 * Storage Module
 *
 * Platform-agnostic storage abstraction for file operations.
 * Supports multiple backends: filesystem, memory (testing), and future database/cloud.
 */

export * from './interface';
export * from './fileStorage';
export * from './memoryStorage';
