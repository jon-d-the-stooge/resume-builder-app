/**
 * Vault Manager
 *
 * CRUD operations for hierarchical Vault structure.
 * Handles persistence, querying, and context-aware retrieval.
 *
 * @see requirements.md - Requirements 3, 4, 5
 */

import {
  Vault,
  VaultSection,
  SectionObject,
  VaultItem,
  VaultProfile,
  VaultMetadata,
  SectionType,
  SectionObjectMetadata,
  ExperienceMetadata,
  VaultQuery,
  VaultQueryResult,
  NewVault,
  NewVaultSection,
  NewSectionObject,
  NewVaultItem,
  isExperienceMetadata,
  isEducationMetadata
} from '../types/vault';
import { StorageProvider, FileStorage } from '../shared/storage';
import { ResumeParser, ParseResult } from './resumeParser';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

/**
 * Default user ID for backward compatibility when userId is not provided
 */
const DEFAULT_USER_ID = 'default';

/**
 * Get effective userId, falling back to default for backward compatibility
 */
function getEffectiveUserId(userId: string | undefined): string {
  return userId || DEFAULT_USER_ID;
}

/**
 * Options for vault operations
 */
interface VaultOperationOptions {
  /** @deprecated Use persistToStorage instead */
  persistToObsidian?: boolean;
  /** Whether to persist changes to storage (default: true) */
  persistToStorage?: boolean;
  /** Whether to update the timestamp (default: true) */
  updateTimestamp?: boolean;
}

/**
 * Check if persistence is enabled (supports both old and new option names)
 */
function shouldPersist(options?: VaultOperationOptions): boolean {
  // New option takes precedence
  if (options?.persistToStorage !== undefined) {
    return options.persistToStorage;
  }
  // Fall back to deprecated option
  if (options?.persistToObsidian !== undefined) {
    return options.persistToObsidian;
  }
  // Default to true
  return true;
}

/**
 * Context information for an item, including all parent data
 */
export interface ItemContext {
  vault: Vault;
  section: VaultSection;
  object: SectionObject;
  item: VaultItem;
}

/**
 * Context information for an object, including parent section
 */
export interface ObjectContext {
  vault: Vault;
  section: VaultSection;
  object: SectionObject;
}

// ============================================================================
// Vault Manager Class
// ============================================================================

/**
 * Configuration options for VaultManager
 */
export interface VaultManagerOptions {
  /**
   * Storage provider for persistence
   * Defaults to FileStorage with user's Documents/ObsidianVault path
   */
  storage?: StorageProvider;

  /**
   * Root path for FileStorage (only used if storage not provided)
   * Defaults to ~/Documents/ObsidianVault
   */
  storagePath?: string;
}

/**
 * VaultManager - CRUD operations for hierarchical vault structure
 *
 * Manages vaults, sections, objects, and items with:
 * - Persistence via pluggable StorageProvider (default: FileStorage)
 * - Context-aware retrieval (items include parent context)
 * - Query capabilities by section type, tags, dates
 */
export class VaultManager {
  // In-memory vault storage
  private vaults: Map<string, Vault> = new Map();

  // Parser for importing resumes
  private parser: ResumeParser;

  // Storage provider for persistence
  private storage: StorageProvider;

  // Directory for vault files
  private readonly vaultDirectory = 'resume-vaults';

  constructor(options?: VaultManagerOptions) {
    this.parser = new ResumeParser();

    // Use provided storage or create default FileStorage
    if (options?.storage) {
      this.storage = options.storage;
    } else {
      const homeDir = process.env.HOME || process.env.USERPROFILE || '';
      const defaultPath = options?.storagePath || path.join(homeDir, 'Documents', 'ObsidianVault');
      this.storage = new FileStorage(defaultPath);
    }
  }

  // ============================================================================
  // Vault Operations
  // ============================================================================

  /**
   * Create a new vault
   * @param userId - The ID of the user creating the vault (uses 'default' if undefined for dev mode)
   */
  async createVault(userId: string | undefined, input: NewVault, options?: VaultOperationOptions): Promise<Vault> {
    const effectiveUserId = getEffectiveUserId(userId);
    const now = new Date().toISOString();
    const vaultId = this.generateId('vault');

    const vault: Vault = {
      id: vaultId,
      version: 1,
      profile: input.profile,
      sections: [],
      metadata: {
        createdAt: now,
        updatedAt: now,
        ownerId: effectiveUserId,
        ...input.metadata
      }
    };

    // Store in memory FIRST so addSection can find it
    this.vaults.set(vaultId, vault);

    // Add sections if provided (don't push - addSection already does)
    if (input.sections) {
      for (const sectionInput of input.sections) {
        await this.addSection(userId, vault.id, sectionInput, { persistToStorage: false });
      }
    }

    // Persist to Obsidian
    if (shouldPersist(options)) {
      await this.persistVault(vault);
    }

    return vault;
  }

  /**
   * Get a vault by ID
   * @param userId - The ID of the user requesting the vault (uses 'default' if undefined for dev mode)
   * Returns null if vault doesn't exist or user doesn't own it (returns 404 for both to prevent enumeration)
   */
  async getVault(userId: string | undefined, vaultId: string): Promise<Vault | null> {
    const effectiveUserId = getEffectiveUserId(userId);

    // Try memory first
    let vault: Vault | null | undefined = this.vaults.get(vaultId);

    // Try loading from Obsidian if not in memory
    if (!vault) {
      vault = await this.loadVaultFromStorage(vaultId);
      if (vault) {
        this.vaults.set(vaultId, vault);
      }
    }

    // Check ownership - return null for non-owned vaults (same as not found)
    if (vault && vault.metadata.ownerId && vault.metadata.ownerId !== effectiveUserId) {
      return null;
    }

    return vault || null;
  }

  /**
   * Get all vaults for a user
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async getAllVaults(userId: string | undefined): Promise<Vault[]> {
    const effectiveUserId = getEffectiveUserId(userId);

    // Load all vaults from Obsidian
    await this.loadAllVaultsFromStorage();

    // Filter by ownership
    return Array.from(this.vaults.values()).filter(
      v => !v.metadata.ownerId || v.metadata.ownerId === effectiveUserId
    );
  }

  /**
   * Update a vault's profile
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async updateVaultProfile(
    userId: string | undefined,
    vaultId: string,
    profile: Partial<VaultProfile>,
    options?: VaultOperationOptions
  ): Promise<Vault> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultId}`);
    }

    vault.profile = { ...vault.profile, ...profile };

    if (options?.updateTimestamp !== false) {
      vault.metadata.updatedAt = new Date().toISOString();
    }

    this.vaults.set(vaultId, vault);

    if (shouldPersist(options)) {
      await this.persistVault(vault);
    }

    return vault;
  }

  /**
   * Delete a vault
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async deleteVault(userId: string | undefined, vaultId: string): Promise<void> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultId}`);
    }

    // Remove from memory
    this.vaults.delete(vaultId);

    // Remove from Obsidian
    await this.deleteVaultFromStorage(vaultId);
  }

  // ============================================================================
  // Section Operations
  // ============================================================================

  /**
   * Add a section to a vault
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async addSection(
    userId: string | undefined,
    vaultId: string,
    input: NewVaultSection,
    options?: VaultOperationOptions
  ): Promise<VaultSection> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultId}`);
    }

    const sectionId = this.generateId('section');
    const section: VaultSection = {
      id: sectionId,
      vaultId,
      type: input.type,
      label: input.label,
      objects: [],
      displayOrder: input.displayOrder ?? vault.sections.length
    };

    // Add objects if provided
    if (input.objects) {
      for (const objInput of input.objects) {
        const obj = this.createObjectFromInput(sectionId, objInput);
        section.objects.push(obj);
      }
    }

    vault.sections.push(section);

    if (options?.updateTimestamp !== false) {
      vault.metadata.updatedAt = new Date().toISOString();
    }

    if (shouldPersist(options)) {
      await this.persistVault(vault);
    }

    return section;
  }

  /**
   * Get a section by ID
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async getSection(userId: string | undefined, vaultId: string, sectionId: string): Promise<VaultSection | null> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) return null;

    return vault.sections.find(s => s.id === sectionId) || null;
  }

  /**
   * Get sections by type
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async getSectionsByType(userId: string | undefined, vaultId: string, type: SectionType): Promise<VaultSection[]> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) return [];

    return vault.sections.filter(s => s.type === type);
  }

  /**
   * Update a section
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async updateSection(
    userId: string | undefined,
    vaultId: string,
    sectionId: string,
    updates: Partial<Pick<VaultSection, 'label' | 'displayOrder'>>,
    options?: VaultOperationOptions
  ): Promise<VaultSection> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultId}`);
    }

    const sectionIndex = vault.sections.findIndex(s => s.id === sectionId);
    if (sectionIndex === -1) {
      throw new Error(`Section not found: ${sectionId}`);
    }

    vault.sections[sectionIndex] = {
      ...vault.sections[sectionIndex],
      ...updates
    };

    if (options?.updateTimestamp !== false) {
      vault.metadata.updatedAt = new Date().toISOString();
    }

    if (shouldPersist(options)) {
      await this.persistVault(vault);
    }

    return vault.sections[sectionIndex];
  }

  /**
   * Delete a section
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async deleteSection(
    userId: string | undefined,
    vaultId: string,
    sectionId: string,
    options?: VaultOperationOptions
  ): Promise<void> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultId}`);
    }

    const sectionIndex = vault.sections.findIndex(s => s.id === sectionId);
    if (sectionIndex === -1) {
      throw new Error(`Section not found: ${sectionId}`);
    }

    vault.sections.splice(sectionIndex, 1);

    if (options?.updateTimestamp !== false) {
      vault.metadata.updatedAt = new Date().toISOString();
    }

    if (shouldPersist(options)) {
      await this.persistVault(vault);
    }
  }

  // ============================================================================
  // Object Operations
  // ============================================================================

  /**
   * Add an object to a section
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async addObject<T extends SectionObjectMetadata>(
    userId: string | undefined,
    vaultId: string,
    sectionId: string,
    input: NewSectionObject<T>,
    options?: VaultOperationOptions
  ): Promise<SectionObject<T>> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultId}`);
    }

    const section = vault.sections.find(s => s.id === sectionId);
    if (!section) {
      throw new Error(`Section not found: ${sectionId}`);
    }

    const obj = this.createObjectFromInput(sectionId, input);
    section.objects.push(obj);

    if (options?.updateTimestamp !== false) {
      vault.metadata.updatedAt = new Date().toISOString();
    }

    if (shouldPersist(options)) {
      await this.persistVault(vault);
    }

    return obj as SectionObject<T>;
  }

  /**
   * Get an object by ID with full context
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async getObject(userId: string | undefined, vaultId: string, objectId: string): Promise<ObjectContext | null> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) return null;

    for (const section of vault.sections) {
      const object = section.objects.find(o => o.id === objectId);
      if (object) {
        return { vault, section, object };
      }
    }

    return null;
  }

  /**
   * Update an object's metadata
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async updateObject<T extends SectionObjectMetadata>(
    userId: string | undefined,
    vaultId: string,
    objectId: string,
    updates: Partial<Pick<SectionObject<T>, 'metadata' | 'displayOrder' | 'tags'>>,
    options?: VaultOperationOptions
  ): Promise<SectionObject<T>> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultId}`);
    }

    for (const section of vault.sections) {
      const objIndex = section.objects.findIndex(o => o.id === objectId);
      if (objIndex !== -1) {
        section.objects[objIndex] = {
          ...section.objects[objIndex],
          ...updates,
          metadata: updates.metadata
            ? { ...section.objects[objIndex].metadata, ...updates.metadata }
            : section.objects[objIndex].metadata
        };

        if (options?.updateTimestamp !== false) {
          vault.metadata.updatedAt = new Date().toISOString();
        }

        if (shouldPersist(options)) {
          await this.persistVault(vault);
        }

        return section.objects[objIndex] as SectionObject<T>;
      }
    }

    throw new Error(`Object not found: ${objectId}`);
  }

  /**
   * Delete an object
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async deleteObject(
    userId: string | undefined,
    vaultId: string,
    objectId: string,
    options?: VaultOperationOptions
  ): Promise<void> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultId}`);
    }

    for (const section of vault.sections) {
      const objIndex = section.objects.findIndex(o => o.id === objectId);
      if (objIndex !== -1) {
        section.objects.splice(objIndex, 1);

        if (options?.updateTimestamp !== false) {
          vault.metadata.updatedAt = new Date().toISOString();
        }

        if (shouldPersist(options)) {
          await this.persistVault(vault);
        }

        return;
      }
    }

    throw new Error(`Object not found: ${objectId}`);
  }

  // ============================================================================
  // Item Operations
  // ============================================================================

  /**
   * Add an item to an object
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async addItem(
    userId: string | undefined,
    vaultId: string,
    objectId: string,
    input: NewVaultItem,
    options?: VaultOperationOptions
  ): Promise<VaultItem> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultId}`);
    }

    for (const section of vault.sections) {
      const obj = section.objects.find(o => o.id === objectId);
      if (obj) {
        const itemId = this.generateId('item');
        const item: VaultItem = {
          id: itemId,
          objectId,
          content: input.content,
          displayOrder: input.displayOrder ?? obj.items.length,
          tags: input.tags,
          metrics: input.metrics
        };

        obj.items.push(item);

        if (options?.updateTimestamp !== false) {
          vault.metadata.updatedAt = new Date().toISOString();
        }

        if (shouldPersist(options)) {
          await this.persistVault(vault);
        }

        return item;
      }
    }

    throw new Error(`Object not found: ${objectId}`);
  }

  /**
   * Get an item by ID with full context
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async getItem(userId: string | undefined, vaultId: string, itemId: string): Promise<ItemContext | null> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) return null;

    for (const section of vault.sections) {
      for (const object of section.objects) {
        const item = object.items.find(i => i.id === itemId);
        if (item) {
          return { vault, section, object, item };
        }
      }
    }

    return null;
  }

  /**
   * Update an item
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async updateItem(
    userId: string | undefined,
    vaultId: string,
    itemId: string,
    updates: Partial<Pick<VaultItem, 'content' | 'displayOrder' | 'tags' | 'metrics'>>,
    options?: VaultOperationOptions
  ): Promise<VaultItem> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultId}`);
    }

    for (const section of vault.sections) {
      for (const obj of section.objects) {
        const itemIndex = obj.items.findIndex(i => i.id === itemId);
        if (itemIndex !== -1) {
          obj.items[itemIndex] = {
            ...obj.items[itemIndex],
            ...updates
          };

          if (options?.updateTimestamp !== false) {
            vault.metadata.updatedAt = new Date().toISOString();
          }

          if (shouldPersist(options)) {
            await this.persistVault(vault);
          }

          return obj.items[itemIndex];
        }
      }
    }

    throw new Error(`Item not found: ${itemId}`);
  }

  /**
   * Delete an item
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async deleteItem(
    userId: string | undefined,
    vaultId: string,
    itemId: string,
    options?: VaultOperationOptions
  ): Promise<void> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) {
      throw new Error(`Vault not found: ${vaultId}`);
    }

    for (const section of vault.sections) {
      for (const obj of section.objects) {
        const itemIndex = obj.items.findIndex(i => i.id === itemId);
        if (itemIndex !== -1) {
          obj.items.splice(itemIndex, 1);

          if (options?.updateTimestamp !== false) {
            vault.metadata.updatedAt = new Date().toISOString();
          }

          if (shouldPersist(options)) {
            await this.persistVault(vault);
          }

          return;
        }
      }
    }

    throw new Error(`Item not found: ${itemId}`);
  }

  // ============================================================================
  // Query Operations
  // ============================================================================

  /**
   * Query vault content with filters
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async queryVault(userId: string | undefined, vaultId: string, query: VaultQuery): Promise<VaultQueryResult[]> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) return [];

    const results: VaultQueryResult[] = [];

    for (const section of vault.sections) {
      // Filter by section type
      if (query.sectionTypes && !query.sectionTypes.includes(section.type)) {
        continue;
      }

      for (const object of section.objects) {
        // Filter by tags
        if (query.tags && query.tags.length > 0) {
          const objectTags = object.tags || [];
          const hasMatchingTag = query.tags.some(tag => objectTags.includes(tag));
          if (!hasMatchingTag) continue;
        }

        // Filter by date range (for experience/education)
        if (query.dateRange) {
          if (!this.objectMatchesDateRange(object, query.dateRange)) {
            continue;
          }
        }

        // Filter by search text
        if (query.searchText) {
          if (!this.objectMatchesSearchText(object, query.searchText)) {
            continue;
          }
        }

        // Build result
        const result: VaultQueryResult = {
          section,
          object,
          items: query.includeItems !== false ? object.items : undefined
        };

        results.push(result);
      }
    }

    return results;
  }

  /**
   * Get all experience objects from a vault
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async getExperienceObjects(userId: string | undefined, vaultId: string): Promise<ObjectContext[]> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) return [];

    const results: ObjectContext[] = [];

    for (const section of vault.sections) {
      if (section.type === 'experience') {
        for (const object of section.objects) {
          results.push({ vault, section, object });
        }
      }
    }

    return results;
  }

  /**
   * Get all items with their context from a vault
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async getAllItems(userId: string | undefined, vaultId: string): Promise<ItemContext[]> {
    const vault = await this.getVault(userId, vaultId);
    if (!vault) return [];

    const results: ItemContext[] = [];

    for (const section of vault.sections) {
      for (const object of section.objects) {
        for (const item of object.items) {
          results.push({ vault, section, object, item });
        }
      }
    }

    return results;
  }

  // ============================================================================
  // Import Operations
  // ============================================================================

  /**
   * Parse and import a resume into a new vault
   * @param userId - The ID of the user (uses 'default' if undefined for dev mode)
   */
  async parseAndImport(userId: string | undefined, resumeText: string, sourceFile?: string): Promise<ParseResult> {
    const effectiveUserId = getEffectiveUserId(userId);
    const result = await this.parser.parseResume(resumeText, sourceFile);

    // Set owner on imported vault
    result.vault.metadata.ownerId = effectiveUserId;

    // Store the vault in memory
    this.vaults.set(result.vault.id, result.vault);

    // Persist to Obsidian
    await this.persistVault(result.vault);

    return result;
  }

  // ============================================================================
  // Persistence Operations
  // ============================================================================

  /**
   * Persist vault to storage as JSON
   */
  private async persistVault(vault: Vault): Promise<void> {
    const filePath = `${this.vaultDirectory}/${vault.id}.json`;
    const content = JSON.stringify(vault, null, 2);
    await this.storage.write(filePath, content);
  }

  /**
   * Load a vault from storage
   */
  private async loadVaultFromStorage(vaultId: string): Promise<Vault | null> {
    try {
      const filePath = `${this.vaultDirectory}/${vaultId}.json`;
      const exists = await this.storage.exists(filePath);
      if (!exists) return null;

      const content = await this.storage.read(filePath);

      // Handle backward compatibility: extract JSON from markdown if frontmatter present
      const jsonContent = this.extractJsonFromMarkdown(content);
      return JSON.parse(jsonContent);
    } catch (error) {
      console.error(`Failed to load vault ${vaultId}:`, error);
      return null;
    }
  }

  /**
   * Load all vaults from storage
   */
  private async loadAllVaultsFromStorage(): Promise<void> {
    try {
      // Check if vault directory exists
      const dirExists = await this.storage.exists(this.vaultDirectory);
      if (!dirExists) {
        console.log(`Vault directory ${this.vaultDirectory} does not exist yet`);
        return;
      }

      // List all files in the vault directory
      const files = await this.storage.list(this.vaultDirectory);

      for (const fileName of files) {
        // Only process .json files
        if (!fileName.endsWith('.json')) continue;

        const filePath = `${this.vaultDirectory}/${fileName}`;
        try {
          const content = await this.storage.read(filePath);
          const jsonContent = this.extractJsonFromMarkdown(content);
          const vault: Vault = JSON.parse(jsonContent);
          this.vaults.set(vault.id, vault);
          console.log(`Loaded vault: ${vault.id}`);
        } catch (error) {
          console.error(`Failed to parse vault from ${filePath}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to load vaults from storage:', error);
    }
  }

  /**
   * Delete vault from storage
   */
  private async deleteVaultFromStorage(vaultId: string): Promise<void> {
    try {
      const filePath = `${this.vaultDirectory}/${vaultId}.json`;
      await this.storage.delete(filePath);
    } catch (error) {
      console.error(`Failed to delete vault ${vaultId}:`, error);
    }
  }

  /**
   * Extract JSON content from markdown (handles legacy frontmatter format)
   * Provides backward compatibility with files stored via obsidianClient
   */
  private extractJsonFromMarkdown(content: string): string {
    // Remove frontmatter if present (legacy format)
    const withoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n\n?/, '');
    return withoutFrontmatter.trim();
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Create a SectionObject from input
   */
  private createObjectFromInput<T extends SectionObjectMetadata>(
    sectionId: string,
    input: NewSectionObject<T>
  ): SectionObject<T> {
    const objectId = this.generateId('object');

    const items: VaultItem[] = (input.items || []).map((itemInput, index) => ({
      id: this.generateId('item'),
      objectId,
      content: itemInput.content,
      displayOrder: itemInput.displayOrder ?? index,
      tags: itemInput.tags,
      metrics: itemInput.metrics
    }));

    return {
      id: objectId,
      sectionId,
      metadata: input.metadata,
      items,
      displayOrder: input.displayOrder,
      tags: input.tags
    } as SectionObject<T>;
  }

  /**
   * Check if an object matches a date range filter
   */
  private objectMatchesDateRange(
    object: SectionObject,
    dateRange: { start: string; end?: string }
  ): boolean {
    const metadata = object.metadata;

    // Get date fields based on metadata type
    let objectStart: string | null = null;
    let objectEnd: string | null = null;

    if (isExperienceMetadata(metadata)) {
      objectStart = metadata.startDate;
      objectEnd = metadata.endDate;
    } else if (isEducationMetadata(metadata)) {
      objectStart = metadata.startDate;
      objectEnd = metadata.endDate;
    }

    if (!objectStart) return true; // No date, include by default

    const filterStart = new Date(dateRange.start);
    const filterEnd = dateRange.end ? new Date(dateRange.end) : new Date('2099-12-31');

    const objStart = new Date(objectStart);
    const objEnd = objectEnd ? new Date(objectEnd) : new Date('2099-12-31');

    // Check overlap
    return objStart <= filterEnd && objEnd >= filterStart;
  }

  /**
   * Check if an object matches search text
   */
  private objectMatchesSearchText(object: SectionObject, searchText: string): boolean {
    const lowerSearch = searchText.toLowerCase();

    // Search in metadata
    const metadata = object.metadata;
    const metadataStr = JSON.stringify(metadata).toLowerCase();
    if (metadataStr.includes(lowerSearch)) return true;

    // Search in items
    for (const item of object.items) {
      if (item.content.toLowerCase().includes(lowerSearch)) return true;
      if (item.tags?.some(tag => tag.toLowerCase().includes(lowerSearch))) return true;
    }

    // Search in object tags
    if (object.tags?.some(tag => tag.toLowerCase().includes(lowerSearch))) return true;

    return false;
  }

  /**
   * Generate unique ID
   */
  private generateId(prefix: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `${prefix}-${timestamp}-${random}`;
  }
}

// Export singleton instance
export const vaultManager = new VaultManager();
