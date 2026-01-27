/**
 * File System Storage Provider
 *
 * Node.js fs-based implementation for Electron/local environments.
 * Uses fs/promises for async operations.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ExtendedStorageProvider, StorageEntry } from './interface';

/**
 * File-system based storage provider
 *
 * All paths are resolved relative to the configured root directory.
 */
export class FileStorage implements ExtendedStorageProvider {
  private readonly rootPath: string;

  /**
   * Create a new FileStorage instance
   * @param rootPath - Absolute path to the storage root directory
   */
  constructor(rootPath: string) {
    this.rootPath = path.resolve(rootPath);
  }

  /**
   * Resolve a relative path to an absolute path within the root
   */
  private resolvePath(relativePath: string): string {
    const resolved = path.resolve(this.rootPath, relativePath);

    // Prevent path traversal attacks
    if (!resolved.startsWith(this.rootPath)) {
      throw new Error(`Invalid path: ${relativePath} escapes storage root`);
    }

    return resolved;
  }

  async read(filePath: string): Promise<string> {
    const absolutePath = this.resolvePath(filePath);
    return fs.readFile(absolutePath, 'utf-8');
  }

  async write(filePath: string, content: string): Promise<void> {
    const absolutePath = this.resolvePath(filePath);
    const directory = path.dirname(absolutePath);

    // Ensure parent directories exist
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(absolutePath, content, 'utf-8');
  }

  async delete(filePath: string): Promise<void> {
    const absolutePath = this.resolvePath(filePath);
    const stats = await fs.stat(absolutePath);

    if (stats.isDirectory()) {
      await fs.rm(absolutePath, { recursive: true });
    } else {
      await fs.unlink(absolutePath);
    }
  }

  async list(directory: string): Promise<string[]> {
    const absolutePath = this.resolvePath(directory);
    return fs.readdir(absolutePath);
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      const absolutePath = this.resolvePath(filePath);
      await fs.access(absolutePath);
      return true;
    } catch {
      return false;
    }
  }

  async listWithMetadata(directory: string): Promise<StorageEntry[]> {
    const absolutePath = this.resolvePath(directory);
    const entries = await fs.readdir(absolutePath, { withFileTypes: true });

    return entries.map((entry) => ({
      name: entry.name,
      path: path.join(directory, entry.name),
      isDirectory: entry.isDirectory(),
    }));
  }

  async mkdir(dirPath: string): Promise<void> {
    const absolutePath = this.resolvePath(dirPath);
    await fs.mkdir(absolutePath, { recursive: true });
  }

  async copy(source: string, destination: string): Promise<void> {
    const sourcePath = this.resolvePath(source);
    const destPath = this.resolvePath(destination);

    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });

    await fs.copyFile(sourcePath, destPath);
  }

  async move(source: string, destination: string): Promise<void> {
    const sourcePath = this.resolvePath(source);
    const destPath = this.resolvePath(destination);

    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    await fs.mkdir(destDir, { recursive: true });

    await fs.rename(sourcePath, destPath);
  }

  /**
   * Get the absolute root path of this storage instance
   */
  getRootPath(): string {
    return this.rootPath;
  }
}
