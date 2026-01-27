/**
 * Manual test for DatabaseStorage with file-based SQLite
 * Run: npx vitest run src/tests/shared/databaseStorage.manual-test.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DatabaseStorage } from '../../shared/storage/databaseStorage';

describe('DatabaseStorage with file-based SQLite', () => {
  const testDbPath = path.join(os.tmpdir(), `test-storage-${Date.now()}.db`);
  let db: DatabaseStorage;

  beforeAll(() => {
    db = new DatabaseStorage({ databasePath: testDbPath, userId: 'user-123' });
    console.log('Created test database at:', testDbPath);
  });

  afterAll(() => {
    db.close();
    // Clean up test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    // Also clean up WAL files
    const walPath = testDbPath + '-wal';
    const shmPath = testDbPath + '-shm';
    if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    console.log('Cleaned up test database');
  });

  describe('basic operations', () => {
    it('should write and read a file', async () => {
      await db.write('test.md', '# Hello World');
      const content = await db.read('test.md');
      expect(content).toBe('# Hello World');
    });

    it('should check file existence', async () => {
      expect(await db.exists('test.md')).toBe(true);
      expect(await db.exists('nonexistent.md')).toBe(false);
    });

    it('should overwrite existing files', async () => {
      await db.write('test.md', 'updated content');
      const content = await db.read('test.md');
      expect(content).toBe('updated content');
    });
  });

  describe('nested directories', () => {
    it('should create parent directories automatically', async () => {
      await db.write('docs/readme.md', '# Docs');
      await db.write('docs/guide/intro.md', '# Intro');

      expect(await db.exists('docs')).toBe(true);
      expect(await db.exists('docs/guide')).toBe(true);
      expect(await db.read('docs/guide/intro.md')).toBe('# Intro');
    });

    it('should list directory contents', async () => {
      const docFiles = await db.list('docs');
      expect(docFiles).toContain('readme.md');
      expect(docFiles).toContain('guide');
    });
  });

  describe('multi-tenant isolation', () => {
    it('should isolate data between users', async () => {
      // User 123 writes a file
      await db.write('user123-file.md', 'User 123 content');

      // User 456 should not see it
      const user456 = db.forUser('user-456');
      expect(await user456.exists('user123-file.md')).toBe(false);

      // User 456 writes their own file
      await user456.write('user456-file.md', 'User 456 content');

      // User 123 should not see User 456's file
      expect(await db.exists('user456-file.md')).toBe(false);

      // Each user sees their own file
      expect(await db.read('user123-file.md')).toBe('User 123 content');
      expect(await user456.read('user456-file.md')).toBe('User 456 content');
    });

    it('should clear only current user data', async () => {
      const user456 = db.forUser('user-456');

      // Ensure user 456 has data
      await user456.write('to-keep.md', 'keep this');

      // Clear user 123's data
      db.clear();

      // User 123's data is gone
      expect(await db.exists('user123-file.md')).toBe(false);

      // User 456's data remains
      expect(await user456.exists('to-keep.md')).toBe(true);
    });
  });

  describe('extended operations', () => {
    let freshDb: DatabaseStorage;

    beforeEach(() => {
      freshDb = new DatabaseStorage({ databasePath: ':memory:', userId: 'test-user' });
    });

    afterEach(() => {
      freshDb.close();
    });

    it('should move files', async () => {
      await freshDb.write('source.txt', 'content');
      await freshDb.move('source.txt', 'dest.txt');

      expect(await freshDb.exists('source.txt')).toBe(false);
      expect(await freshDb.read('dest.txt')).toBe('content');
    });

    it('should copy files', async () => {
      await freshDb.write('original.txt', 'content');
      await freshDb.copy('original.txt', 'copy.txt');

      expect(await freshDb.read('original.txt')).toBe('content');
      expect(await freshDb.read('copy.txt')).toBe('content');
    });

    it('should delete directories recursively', async () => {
      await freshDb.write('dir/a.txt', 'A');
      await freshDb.write('dir/sub/b.txt', 'B');

      await freshDb.delete('dir');

      expect(await freshDb.exists('dir')).toBe(false);
      expect(await freshDb.exists('dir/a.txt')).toBe(false);
      expect(await freshDb.exists('dir/sub/b.txt')).toBe(false);
    });

    it('should provide accurate stats', async () => {
      await freshDb.write('file1.txt', 'hello');
      await freshDb.write('file2.txt', 'world!');
      await freshDb.mkdir('subdir');

      const stats = freshDb.getStats();

      expect(stats.fileCount).toBe(2);
      expect(stats.totalSize).toBe(11); // 'hello' + 'world!'
      expect(stats.directoryCount).toBe(1);
    });
  });

  describe('persistence', () => {
    it('should persist data across connections', async () => {
      const persistPath = path.join(os.tmpdir(), `persist-test-${Date.now()}.db`);

      try {
        // Create and write
        const db1 = new DatabaseStorage({ databasePath: persistPath, userId: 'user-1' });
        await db1.write('persistent.md', '# Persisted');
        db1.close();

        // Reopen and read
        const db2 = new DatabaseStorage({ databasePath: persistPath, userId: 'user-1' });
        const content = await db2.read('persistent.md');
        expect(content).toBe('# Persisted');
        db2.close();
      } finally {
        // Cleanup
        if (fs.existsSync(persistPath)) fs.unlinkSync(persistPath);
        const walPath = persistPath + '-wal';
        const shmPath = persistPath + '-shm';
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      }
    });
  });
});
