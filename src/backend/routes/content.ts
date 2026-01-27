/**
 * Content routes - handles content item management for resume building.
 * Maps IPC handlers (create-manual-content, search-content, get-content-item,
 * update-content-item, delete-content-item, clear-vault) to REST endpoints.
 */

import { Router, Request, Response } from 'express';
import { contentManager, vaultManager } from '../services';
import { ContentType } from '../../shared/obsidian/types';
import type { ContentItemInput, SearchQuery } from '../../types';

const router = Router();

/**
 * Valid content types for validation
 */
const VALID_CONTENT_TYPES: ContentType[] = [
  ContentType.JOB_ENTRY,
  ContentType.SKILL,
  ContentType.ACCOMPLISHMENT,
  ContentType.EDUCATION,
  ContentType.CERTIFICATION,
  ContentType.JOB_TITLE,
  ContentType.JOB_LOCATION,
  ContentType.JOB_DURATION
];

/**
 * GET /api/content
 * Search content items with optional filtering
 * Maps to IPC: search-content
 *
 * Query params:
 * - contentType: Filter by content type
 * - text: Full-text search
 * - tags: Comma-separated list of tags to filter by
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const query: SearchQuery = {};

    // Extract content type filter
    if (req.query.contentType) {
      const contentType = req.query.contentType as string;
      if (!VALID_CONTENT_TYPES.includes(contentType as ContentType)) {
        res.status(400).json({
          error: 'Invalid content type',
          message: `contentType must be one of: ${VALID_CONTENT_TYPES.join(', ')}`
        });
        return;
      }
      query.contentType = contentType as ContentType;
    }

    // Extract text search
    if (req.query.text) {
      query.text = req.query.text as string;
    }

    // Extract tags filter
    if (req.query.tags) {
      const tagsParam = req.query.tags as string;
      query.tags = tagsParam.split(',').map(t => t.trim()).filter(t => t);
    }

    // Search requires at least one filter criterion
    if (!query.contentType && !query.text && !query.tags) {
      // If no filters provided, return empty array with a helpful message
      res.json({
        success: true,
        items: [],
        message: 'Provide at least one filter: contentType, text, or tags'
      });
      return;
    }

    const items = await contentManager.searchContentItems(query);

    // Format response to match IPC handler format
    const formattedItems = items.map(item => ({
      id: item.id,
      type: item.type,
      content: item.content,
      tags: item.tags,
      metadata: item.metadata,
      parentId: item.parentId,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt
    }));

    res.json({
      success: true,
      items: formattedItems
    });
  } catch (error) {
    console.error('Error searching content:', error);
    res.status(500).json({
      error: 'Failed to search content',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/content/:id
 * Get a single content item by ID
 * Maps to IPC: get-content-item
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const item = await contentManager.getContentItemById(id);

    if (!item) {
      res.status(404).json({
        error: 'Content item not found',
        message: `No content item exists with ID: ${id}`
      });
      return;
    }

    res.json({
      success: true,
      item: {
        id: item.id,
        type: item.type,
        content: item.content,
        tags: item.tags,
        metadata: item.metadata,
        parentId: item.parentId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }
    });
  } catch (error) {
    console.error('Error getting content item:', error);
    res.status(500).json({
      error: 'Failed to get content item',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/content
 * Create a new content item
 * Maps to IPC: create-manual-content
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { type, content, parentId, tags, metadata } = req.body;

    // Validate required fields
    if (!type || !content) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'type and content are required'
      });
      return;
    }

    // Validate content type
    if (!VALID_CONTENT_TYPES.includes(type as ContentType)) {
      res.status(400).json({
        error: 'Invalid content type',
        message: `type must be one of: ${VALID_CONTENT_TYPES.join(', ')}`
      });
      return;
    }

    // Check for duplicates before creating
    const duplicates = await contentManager.detectDuplicates({
      type,
      content,
      tags: tags || [],
      metadata: metadata || {}
    });

    if (duplicates.length > 0) {
      res.status(409).json({
        error: 'Duplicate content detected',
        message: 'A similar content item already exists',
        duplicates: duplicates.map(d => ({ id: d.id, content: d.content }))
      });
      return;
    }

    const itemInput: ContentItemInput = {
      type,
      content,
      tags: tags || [],
      metadata: metadata || {},
      parentId
    };

    const item = await contentManager.createContentItem(itemInput);

    res.status(201).json({
      success: true,
      id: item.id,
      item: {
        id: item.id,
        type: item.type,
        content: item.content,
        tags: item.tags,
        metadata: item.metadata,
        parentId: item.parentId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }
    });
  } catch (error) {
    console.error('Error creating content item:', error);
    res.status(500).json({
      error: 'Failed to create content item',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PATCH /api/content/:id
 * Update an existing content item
 * Maps to IPC: update-content-item
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type, content, tags, metadata } = req.body;

    // Validate content type if provided
    if (type && !VALID_CONTENT_TYPES.includes(type as ContentType)) {
      res.status(400).json({
        error: 'Invalid content type',
        message: `type must be one of: ${VALID_CONTENT_TYPES.join(', ')}`
      });
      return;
    }

    // Ensure at least one update field is provided
    if (type === undefined && content === undefined && tags === undefined && metadata === undefined) {
      res.status(400).json({
        error: 'No updates provided',
        message: 'At least one of type, content, tags, or metadata must be provided'
      });
      return;
    }

    // Build updates object
    const updates: Partial<ContentItemInput> = {};
    if (type !== undefined) updates.type = type;
    if (content !== undefined) updates.content = content;
    if (tags !== undefined) updates.tags = tags;
    if (metadata !== undefined) updates.metadata = metadata;

    const item = await contentManager.updateContentItem(id, updates);

    res.json({
      success: true,
      id: item.id,
      item: {
        id: item.id,
        type: item.type,
        content: item.content,
        tags: item.tags,
        metadata: item.metadata,
        parentId: item.parentId,
        createdAt: item.createdAt,
        updatedAt: item.updatedAt
      }
    });
  } catch (error) {
    console.error('Error updating content item:', error);

    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Content item not found',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to update content item',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/content/:id
 * Delete a content item
 * Maps to IPC: delete-content-item
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    await contentManager.deleteContentItem(id);

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting content item:', error);

    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Content item not found',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to delete content item',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/content/:parentId/link/:childId
 * Link two content items in a parent-child relationship
 */
router.post('/:parentId/link/:childId', async (req: Request, res: Response) => {
  try {
    const { parentId, childId } = req.params;

    await contentManager.linkContentItems(parentId, childId);

    res.json({
      success: true,
      message: `Linked ${childId} as child of ${parentId}`
    });
  } catch (error) {
    console.error('Error linking content items:', error);

    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Content item not found',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to link content items',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/content/skills/:skillId/link-jobs
 * Link a skill to multiple job entries
 */
router.post('/skills/:skillId/link-jobs', async (req: Request, res: Response) => {
  try {
    const { skillId } = req.params;
    const { jobIds } = req.body;

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      res.status(400).json({
        error: 'Invalid jobIds',
        message: 'jobIds must be a non-empty array of job entry IDs'
      });
      return;
    }

    await contentManager.linkSkillToMultipleJobs(skillId, jobIds);

    res.json({
      success: true,
      message: `Linked skill ${skillId} to ${jobIds.length} job entries`
    });
  } catch (error) {
    console.error('Error linking skill to jobs:', error);

    if (error instanceof Error && (error.message.includes('not found') || error.message.includes('not a'))) {
      res.status(400).json({
        error: 'Invalid request',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to link skill to jobs',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/content/vault
 * Clear all vault content
 * Maps to IPC: clear-vault
 *
 * Requires confirmation in request body: { confirmation: "delete" }
 */
router.delete('/vault', async (req: Request, res: Response) => {
  try {
    const { confirmation } = req.body;

    if (confirmation !== 'delete') {
      res.status(400).json({
        error: 'Confirmation required',
        message: 'Send { confirmation: "delete" } to confirm vault deletion'
      });
      return;
    }

    const vaults = await vaultManager.getAllVaults(req.user?.id);
    let deletedCount = 0;

    for (const vault of vaults) {
      await vaultManager.deleteVault(req.user?.id, vault.id);
      deletedCount++;
    }

    res.json({
      success: true,
      deletedCount
    });
  } catch (error) {
    console.error('Error clearing vault:', error);
    res.status(500).json({
      error: 'Failed to clear vault',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
