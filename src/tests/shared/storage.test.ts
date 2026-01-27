/**
 * Unit tests for storage providers
 *
 * Both FileStorage and MemoryStorage should pass identical tests,
 * ensuring the interface contract is properly implemented.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { StorageProvider } from '../../shared/storage/interface';
import { FileStorage } from '../../shared/storage/fileStorage';
import { MemoryStorage } from '../../shared/storage/memoryStorage';
import { DatabaseStorage } from '../../shared/storage/databaseStorage';

/**
 * Shared test suite that both implementations must pass
 */
function testStorageProvider(
  name: string,
  createStorage: () => Promise<{ storage: StorageProvider; cleanup: () => Promise<void> }>
) {
  describe(`${name}`, () => {
    let storage: StorageProvider;
    let cleanup: () => Promise<void>;

    beforeEach(async () => {
      const result = await createStorage();
      storage = result.storage;
      cleanup = result.cleanup;
    });

    afterEach(async () => {
      await cleanup();
    });

    describe('basic operations', () => {
      it('should write and read a file', async () => {
        await storage.write('test.md', '# Hello');
        const content = await storage.read('test.md');
        expect(content).toBe('# Hello');
      });

      it('should check if file exists', async () => {
        const existsBefore = await storage.exists('test.md');
        expect(existsBefore).toBe(false);

        await storage.write('test.md', '# Hello');
        const existsAfter = await storage.exists('test.md');
        expect(existsAfter).toBe(true);
      });

      it('should delete a file', async () => {
        await storage.write('test.md', '# Hello');
        expect(await storage.exists('test.md')).toBe(true);

        await storage.delete('test.md');
        expect(await storage.exists('test.md')).toBe(false);
      });

      it('should list files in a directory', async () => {
        await storage.write('file1.md', 'content1');
        await storage.write('file2.md', 'content2');
        await storage.write('file3.txt', 'content3');

        const files = await storage.list('.');
        expect(files).toContain('file1.md');
        expect(files).toContain('file2.md');
        expect(files).toContain('file3.txt');
      });
    });

    describe('nested directories', () => {
      it('should create parent directories when writing', async () => {
        await storage.write('nested/deep/file.md', '# Nested');
        const content = await storage.read('nested/deep/file.md');
        expect(content).toBe('# Nested');
      });

      it('should list files in nested directories', async () => {
        await storage.write('docs/readme.md', '# Docs');
        await storage.write('docs/guide.md', '# Guide');

        const files = await storage.list('docs');
        expect(files).toContain('readme.md');
        expect(files).toContain('guide.md');
      });

      it('should check existence of nested files', async () => {
        await storage.write('a/b/c.txt', 'content');
        expect(await storage.exists('a/b/c.txt')).toBe(true);
        expect(await storage.exists('a/b/d.txt')).toBe(false);
        expect(await storage.exists('a/b')).toBe(true);
      });
    });

    describe('overwriting', () => {
      it('should overwrite existing files', async () => {
        await storage.write('test.md', 'original');
        await storage.write('test.md', 'updated');
        const content = await storage.read('test.md');
        expect(content).toBe('updated');
      });
    });

    describe('error handling', () => {
      it('should throw when reading non-existent file', async () => {
        await expect(storage.read('nonexistent.md')).rejects.toThrow();
      });

      it('should throw when deleting non-existent file', async () => {
        await expect(storage.delete('nonexistent.md')).rejects.toThrow();
      });

      it('should throw when listing non-existent directory', async () => {
        await expect(storage.list('nonexistent')).rejects.toThrow();
      });
    });

    describe('special content', () => {
      it('should handle empty files', async () => {
        await storage.write('empty.md', '');
        const content = await storage.read('empty.md');
        expect(content).toBe('');
      });

      it('should handle unicode content', async () => {
        const unicode = '# 你好世界 🌍\nКириллица\nελληνικά';
        await storage.write('unicode.md', unicode);
        const content = await storage.read('unicode.md');
        expect(content).toBe(unicode);
      });

      it('should handle large files', async () => {
        const largeContent = 'x'.repeat(100000);
        await storage.write('large.txt', largeContent);
        const content = await storage.read('large.txt');
        expect(content).toBe(largeContent);
      });

      it('should preserve newlines and whitespace', async () => {
        const content = '  leading\n\n\nmultiple newlines\n  trailing  ';
        await storage.write('whitespace.txt', content);
        const read = await storage.read('whitespace.txt');
        expect(read).toBe(content);
      });
    });
  });
}

describe('Storage Providers', () => {
  // Test MemoryStorage
  testStorageProvider('MemoryStorage', async () => {
    const storage = new MemoryStorage();
    return {
      storage,
      cleanup: async () => {
        storage.clear();
      },
    };
  });

  // Test FileStorage
  testStorageProvider('FileStorage', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
    const storage = new FileStorage(tempDir);
    return {
      storage,
      cleanup: async () => {
        await fs.rm(tempDir, { recursive: true, force: true });
      },
    };
  });

  // Test DatabaseStorage
  testStorageProvider('DatabaseStorage', async () => {
    const storage = new DatabaseStorage({
      databasePath: ':memory:',
      userId: 'test-user',
    });
    return {
      storage,
      cleanup: async () => {
        storage.clear();
        storage.close();
      },
    };
  });

  // MemoryStorage-specific tests
  describe('MemoryStorage specifics', () => {
    it('should clear all data', async () => {
      const storage = new MemoryStorage();
      await storage.write('file1.md', 'content1');
      await storage.write('file2.md', 'content2');

      storage.clear();

      expect(await storage.exists('file1.md')).toBe(false);
      expect(await storage.exists('file2.md')).toBe(false);
    });

    it('should dump file system state', async () => {
      const storage = new MemoryStorage();
      await storage.write('a.txt', 'A');
      await storage.write('dir/b.txt', 'B');

      const dump = storage.dump();
      expect(dump['a.txt']).toBe('A');
      expect(dump['dir/b.txt']).toBe('B');
    });
  });

  // FileStorage-specific tests
  describe('FileStorage specifics', () => {
    let tempDir: string;
    let storage: FileStorage;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
      storage = new FileStorage(tempDir);
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it('should return the root path', () => {
      expect(storage.getRootPath()).toBe(tempDir);
    });

    it('should prevent path traversal attacks', async () => {
      await expect(storage.read('../../../etc/passwd')).rejects.toThrow(
        /escapes storage root/
      );
    });

    it('should delete directories recursively', async () => {
      await storage.write('dir/a.txt', 'A');
      await storage.write('dir/sub/b.txt', 'B');

      await storage.delete('dir');

      expect(await storage.exists('dir')).toBe(false);
    });
  });

  // DatabaseStorage-specific tests
  describe('DatabaseStorage specifics', () => {
    let storage: DatabaseStorage;

    beforeEach(() => {
      storage = new DatabaseStorage({
        databasePath: ':memory:',
        userId: 'test-user',
      });
    });

    afterEach(() => {
      storage.close();
    });

    it('should return the user ID', () => {
      expect(storage.getUserId()).toBe('test-user');
    });

    it('should create storage for different user', async () => {
      await storage.write('file.txt', 'user1-content');

      const user2Storage = storage.forUser('user2');
      await user2Storage.write('file.txt', 'user2-content');

      // Each user has their own file
      expect(await storage.read('file.txt')).toBe('user1-content');
      expect(await user2Storage.read('file.txt')).toBe('user2-content');
    });

    it('should isolate data between users', async () => {
      await storage.write('secret.txt', 'user1-secret');

      const user2Storage = storage.forUser('user2');

      // User 2 should not see User 1's file
      expect(await user2Storage.exists('secret.txt')).toBe(false);
      await expect(user2Storage.read('secret.txt')).rejects.toThrow();
    });

    it('should clear only current user data', async () => {
      const user2Storage = storage.forUser('user2');

      await storage.write('user1.txt', 'content1');
      await user2Storage.write('user2.txt', 'content2');

      storage.clear();

      // User 1's data is gone
      expect(await storage.exists('user1.txt')).toBe(false);
      // User 2's data remains
      expect(await user2Storage.exists('user2.txt')).toBe(true);
    });

    it('should provide storage statistics', async () => {
      await storage.write('file1.txt', 'hello');
      await storage.write('file2.txt', 'world!');
      await storage.mkdir('subdir');

      const stats = storage.getStats();

      expect(stats.fileCount).toBe(2);
      expect(stats.totalSize).toBe(11); // 'hello' + 'world!'
      expect(stats.directoryCount).toBe(1);
    });

    it('should dump all files for current user', async () => {
      await storage.write('a.txt', 'A');
      await storage.write('dir/b.txt', 'B');

      const dump = storage.dump();

      expect(dump['a.txt']).toBe('A');
      expect(dump['dir/b.txt']).toBe('B');
    });

    it('should handle directory operations', async () => {
      await storage.mkdir('new/nested/dir');
      expect(await storage.exists('new/nested/dir')).toBe(true);
      expect(await storage.exists('new/nested')).toBe(true);
      expect(await storage.exists('new')).toBe(true);
    });

    it('should delete directories and children', async () => {
      await storage.write('dir/file1.txt', 'content1');
      await storage.write('dir/sub/file2.txt', 'content2');

      await storage.delete('dir');

      expect(await storage.exists('dir')).toBe(false);
      expect(await storage.exists('dir/file1.txt')).toBe(false);
      expect(await storage.exists('dir/sub/file2.txt')).toBe(false);
    });

    it('should move files between paths', async () => {
      await storage.write('source.txt', 'content');
      await storage.move('source.txt', 'dest.txt');

      expect(await storage.exists('source.txt')).toBe(false);
      expect(await storage.read('dest.txt')).toBe('content');
    });

    it('should move directories with children', async () => {
      await storage.write('src/a.txt', 'A');
      await storage.write('src/b.txt', 'B');
      await storage.mkdir('src');

      await storage.move('src', 'dst');

      expect(await storage.exists('src')).toBe(false);
      expect(await storage.read('dst/a.txt')).toBe('A');
      expect(await storage.read('dst/b.txt')).toBe('B');
    });

    it('should list with metadata including directories', async () => {
      await storage.write('file.txt', 'content');
      await storage.mkdir('subdir');

      const entries = await storage.listWithMetadata('.');
      const file = entries.find((e) => e.name === 'file.txt');
      const dir = entries.find((e) => e.name === 'subdir');

      expect(file?.isDirectory).toBe(false);
      expect(dir?.isDirectory).toBe(true);
    });
  });

  // ExtendedStorageProvider tests
  describe('ExtendedStorageProvider methods', () => {
    let storage: MemoryStorage;

    beforeEach(() => {
      storage = new MemoryStorage();
    });

    it('should list with metadata', async () => {
      await storage.write('file.txt', 'content');
      await storage.mkdir('subdir');

      const entries = await storage.listWithMetadata('.');
      const file = entries.find((e) => e.name === 'file.txt');
      const dir = entries.find((e) => e.name === 'subdir');

      expect(file?.isDirectory).toBe(false);
      expect(dir?.isDirectory).toBe(true);
    });

    it('should copy files', async () => {
      await storage.write('source.txt', 'original');
      await storage.copy('source.txt', 'dest.txt');

      expect(await storage.read('source.txt')).toBe('original');
      expect(await storage.read('dest.txt')).toBe('original');
    });

    it('should move files', async () => {
      await storage.write('source.txt', 'original');
      await storage.move('source.txt', 'dest.txt');

      expect(await storage.exists('source.txt')).toBe(false);
      expect(await storage.read('dest.txt')).toBe('original');
    });

    it('should create directories', async () => {
      await storage.mkdir('new/nested/dir');
      expect(await storage.exists('new/nested/dir')).toBe(true);
    });
  });
});

// ============================================================================
// Integration Tests: Using MemoryStorage with Refactored Modules
// ============================================================================

describe('Integration: Storage-Agnostic Modules', () => {
  // Import the refactored modules that accept StorageProvider
  // These tests demonstrate the dependency injection pattern works correctly

  // VaultManager tests are skipped due to settingsStore requiring electron/web environment
  // The pattern is identical to ApplicationsStore which is tested below
  describe.skip('VaultManager with MemoryStorage', () => {
    let storage: MemoryStorage;

    beforeEach(() => {
      storage = new MemoryStorage();
    });

    it('should create and retrieve vaults using memory storage', async () => {
      // Dynamic import to avoid circular dependency issues
      const { VaultManager } = await import('../../main/vaultManager');

      const vaultMgr = new VaultManager({ storage });
      const userId = 'test-user';

      // Create a vault
      const vault = await vaultMgr.createVault(userId, {
        profile: {
          name: 'Test User',
          email: 'test@example.com',
        },
      });

      expect(vault.id).toBeDefined();
      expect(vault.profile.name).toBe('Test User');

      // Retrieve all vaults
      const vaults = await vaultMgr.getAllVaults(userId);
      expect(vaults.length).toBe(1);
      expect(vaults[0].id).toBe(vault.id);

      // Verify data is in memory storage
      const dump = storage.dump();
      const vaultFiles = Object.keys(dump).filter((k) => k.includes('vault'));
      expect(vaultFiles.length).toBe(1);
    });

    it('should delete vaults from memory storage', async () => {
      const { VaultManager } = await import('../../main/vaultManager');

      const vaultMgr = new VaultManager({ storage });
      const userId = 'test-user';

      const vault = await vaultMgr.createVault(userId, {
        profile: { name: 'To Delete', email: 'delete@test.com' },
      });

      await vaultMgr.deleteVault(userId, vault.id);

      const vaults = await vaultMgr.getAllVaults(userId);
      expect(vaults.length).toBe(0);

      // Verify removed from storage
      const dump = storage.dump();
      expect(Object.keys(dump).length).toBe(0);
    });
  });

  describe('ApplicationsStore with MemoryStorage', () => {
    let storage: MemoryStorage;

    beforeEach(() => {
      storage = new MemoryStorage();
    });

    it('should save and list applications using memory storage', async () => {
      const { ApplicationsStore } = await import('../../main/applicationsStore');

      const store = new ApplicationsStore({ storage });
      const userId = 'test-user';

      // Save an application
      const app = await store.save(userId, {
        jobTitle: 'Software Engineer',
        company: 'Test Corp',
        jobDescription: 'Build amazing software',
        generatedResume: '# Resume\n\nExperience...',
        score: 85,
        metadata: {
          iterations: 3,
          initialScore: 70,
        },
      });

      expect(app).not.toBeNull();
      expect(app!.jobTitle).toBe('Software Engineer');

      // List applications
      const apps = await store.list(userId);
      expect(apps.length).toBe(1);
      expect(apps[0].company).toBe('Test Corp');
    });

    it('should update application status', async () => {
      const { ApplicationsStore } = await import('../../main/applicationsStore');

      const store = new ApplicationsStore({ storage });
      const userId = 'test-user';

      const app = await store.save(userId, {
        jobTitle: 'Product Manager',
        company: 'Startup Inc',
        jobDescription: 'Lead product strategy',
        generatedResume: '# PM Resume',
        score: 90,
        metadata: { iterations: 2, initialScore: 80 },
      });

      const updated = await store.update(userId, app!.id, {
        status: 'applied',
        notes: 'Applied on 2024-01-15',
      });

      expect(updated!.status).toBe('applied');
      expect(updated!.notes).toBe('Applied on 2024-01-15');
    });
  });

  describe('Multi-tenant isolation', () => {
    let storage: MemoryStorage;

    beforeEach(() => {
      storage = new MemoryStorage();
    });

    // Skipped due to settingsStore environment dependency
    it.skip('should isolate vaults between users', async () => {
      const { VaultManager } = await import('../../main/vaultManager');

      const vaultMgr = new VaultManager({ storage });

      // Create vaults for two different users
      await vaultMgr.createVault('user-a', {
        profile: { name: 'User A', email: 'a@test.com' },
      });

      await vaultMgr.createVault('user-b', {
        profile: { name: 'User B', email: 'b@test.com' },
      });

      // Each user should only see their own vault
      const vaultsA = await vaultMgr.getAllVaults('user-a');
      const vaultsB = await vaultMgr.getAllVaults('user-b');

      expect(vaultsA.length).toBe(1);
      expect(vaultsA[0].profile.name).toBe('User A');

      expect(vaultsB.length).toBe(1);
      expect(vaultsB[0].profile.name).toBe('User B');
    });

    it('should prevent cross-user access to applications', async () => {
      const { ApplicationsStore } = await import('../../main/applicationsStore');

      const store = new ApplicationsStore({ storage });

      // User A saves an application
      const appA = await store.save('user-a', {
        jobTitle: 'Engineer',
        company: 'Company A',
        jobDescription: 'Build stuff',
        generatedResume: '# Resume A',
        score: 85,
        metadata: { iterations: 1, initialScore: 85 },
      });

      // User B should not see User A's application
      const appsB = await store.list('user-b');
      expect(appsB.length).toBe(0);

      // User B should not be able to get User A's application by ID
      const result = await store.get('user-b', appA!.id);
      expect(result).toBeNull();
    });
  });
});
