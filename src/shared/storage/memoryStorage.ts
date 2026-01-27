/**
 * In-Memory Storage Provider
 *
 * Memory-based implementation for testing and development.
 * Data is stored in a Map and persists only for the lifetime of the instance.
 */

import * as path from 'path';
import { ExtendedStorageProvider, StorageEntry } from './interface';

/**
 * Node in the virtual file system tree
 */
interface FSNode {
  type: 'file' | 'directory';
  content?: string;
  children?: Map<string, FSNode>;
}

/**
 * In-memory storage provider for testing
 *
 * Simulates a file system using a tree structure in memory.
 * Useful for unit tests that need storage without disk I/O.
 */
export class MemoryStorage implements ExtendedStorageProvider {
  private root: FSNode;

  constructor() {
    this.root = {
      type: 'directory',
      children: new Map(),
    };
  }

  /**
   * Parse a path into segments
   */
  private parsePath(filePath: string): string[] {
    const normalized = path.normalize(filePath).replace(/^\/+|\/+$/g, '');
    if (normalized === '' || normalized === '.') {
      return [];
    }
    return normalized.split(path.sep);
  }

  /**
   * Navigate to a node, optionally creating directories along the way
   */
  private navigate(
    segments: string[],
    createDirectories: boolean = false
  ): FSNode | null {
    let current = this.root;

    for (const segment of segments) {
      if (current.type !== 'directory' || !current.children) {
        return null;
      }

      let child = current.children.get(segment);

      if (!child) {
        if (createDirectories) {
          child = { type: 'directory', children: new Map() };
          current.children.set(segment, child);
        } else {
          return null;
        }
      }

      current = child;
    }

    return current;
  }

  /**
   * Get parent directory and file name from path
   */
  private getParentAndName(filePath: string): { parent: FSNode | null; name: string } {
    const segments = this.parsePath(filePath);
    if (segments.length === 0) {
      return { parent: null, name: '' };
    }

    const name = segments.pop()!;
    const parent = this.navigate(segments, false);

    return { parent, name };
  }

  async read(filePath: string): Promise<string> {
    const segments = this.parsePath(filePath);
    const node = this.navigate(segments);

    if (!node) {
      throw new Error(`ENOENT: no such file or directory: ${filePath}`);
    }

    if (node.type !== 'file') {
      throw new Error(`EISDIR: illegal operation on a directory: ${filePath}`);
    }

    return node.content ?? '';
  }

  async write(filePath: string, content: string): Promise<void> {
    const segments = this.parsePath(filePath);
    if (segments.length === 0) {
      throw new Error('Cannot write to root directory');
    }

    const fileName = segments.pop()!;
    const parent = this.navigate(segments, true);

    if (!parent || parent.type !== 'directory' || !parent.children) {
      throw new Error(`Cannot create file in non-directory: ${filePath}`);
    }

    parent.children.set(fileName, {
      type: 'file',
      content,
    });
  }

  async delete(filePath: string): Promise<void> {
    const segments = this.parsePath(filePath);
    if (segments.length === 0) {
      throw new Error('Cannot delete root directory');
    }

    const name = segments.pop()!;
    const parent = this.navigate(segments);

    if (!parent || parent.type !== 'directory' || !parent.children) {
      throw new Error(`ENOENT: no such file or directory: ${filePath}`);
    }

    if (!parent.children.has(name)) {
      throw new Error(`ENOENT: no such file or directory: ${filePath}`);
    }

    parent.children.delete(name);
  }

  async list(directory: string): Promise<string[]> {
    const segments = this.parsePath(directory);
    const node = this.navigate(segments);

    if (!node) {
      throw new Error(`ENOENT: no such file or directory: ${directory}`);
    }

    if (node.type !== 'directory' || !node.children) {
      throw new Error(`ENOTDIR: not a directory: ${directory}`);
    }

    return Array.from(node.children.keys());
  }

  async exists(filePath: string): Promise<boolean> {
    const segments = this.parsePath(filePath);
    const node = this.navigate(segments);
    return node !== null;
  }

  async listWithMetadata(directory: string): Promise<StorageEntry[]> {
    const segments = this.parsePath(directory);
    const node = this.navigate(segments);

    if (!node) {
      throw new Error(`ENOENT: no such file or directory: ${directory}`);
    }

    if (node.type !== 'directory' || !node.children) {
      throw new Error(`ENOTDIR: not a directory: ${directory}`);
    }

    const entries: StorageEntry[] = [];
    for (const [name, child] of node.children) {
      entries.push({
        name,
        path: path.join(directory, name),
        isDirectory: child.type === 'directory',
      });
    }

    return entries;
  }

  async mkdir(dirPath: string): Promise<void> {
    const segments = this.parsePath(dirPath);
    this.navigate(segments, true);
  }

  async copy(source: string, destination: string): Promise<void> {
    const content = await this.read(source);
    await this.write(destination, content);
  }

  async move(source: string, destination: string): Promise<void> {
    const content = await this.read(source);
    await this.write(destination, content);
    await this.delete(source);
  }

  /**
   * Clear all data (useful for test cleanup)
   */
  clear(): void {
    this.root = {
      type: 'directory',
      children: new Map(),
    };
  }

  /**
   * Dump the entire file system structure (for debugging)
   */
  dump(): Record<string, string> {
    const result: Record<string, string> = {};

    const traverse = (node: FSNode, currentPath: string) => {
      if (node.type === 'file') {
        result[currentPath] = node.content ?? '';
      } else if (node.children) {
        for (const [name, child] of node.children) {
          traverse(child, currentPath ? `${currentPath}/${name}` : name);
        }
      }
    };

    traverse(this.root, '');
    return result;
  }
}
