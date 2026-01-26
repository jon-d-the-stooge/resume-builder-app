/**
 * Knowledge Base routes - handles CRUD operations for optimized resume storage.
 * Maps IPC handlers (knowledge-base-list, knowledge-base-get, knowledge-base-save,
 * knowledge-base-update, knowledge-base-delete, knowledge-base-stats,
 * knowledge-base-companies, knowledge-base-job-titles) to REST endpoints.
 */

import { Router, Request, Response } from 'express';
import { knowledgeBaseStore } from '../services';
import type { KnowledgeBaseFilters } from '../../main/knowledgeBaseStore';

const router = Router();

/**
 * GET /api/knowledge-base
 * List all knowledge base entries with optional filtering and sorting
 * Maps to IPC: knowledge-base-list
 *
 * Query params:
 * - company: Filter by company name
 * - jobTitle: Filter by job title
 * - dateStart: Filter entries created on or after this date (ISO format)
 * - dateEnd: Filter entries created on or before this date (ISO format)
 * - text: Full-text search across title, company, description, and tags
 * - sortBy: Sort field ('date' | 'score' | 'company'), defaults to 'date'
 * - sortOrder: Sort direction ('asc' | 'desc'), defaults to 'desc'
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const filters: KnowledgeBaseFilters = {};

    // Extract and apply filters from query params
    if (req.query.company) {
      filters.company = req.query.company as string;
    }
    if (req.query.jobTitle) {
      filters.jobTitle = req.query.jobTitle as string;
    }
    if (req.query.dateStart) {
      filters.dateStart = req.query.dateStart as string;
    }
    if (req.query.dateEnd) {
      filters.dateEnd = req.query.dateEnd as string;
    }
    if (req.query.text) {
      filters.text = req.query.text as string;
    }
    if (req.query.sortBy) {
      const sortBy = req.query.sortBy as string;
      if (['date', 'score', 'company'].includes(sortBy)) {
        filters.sortBy = sortBy as 'date' | 'score' | 'company';
      }
    }
    if (req.query.sortOrder) {
      const sortOrder = req.query.sortOrder as string;
      if (['asc', 'desc'].includes(sortOrder)) {
        filters.sortOrder = sortOrder as 'asc' | 'desc';
      }
    }

    const entries = knowledgeBaseStore.list(Object.keys(filters).length > 0 ? filters : undefined);

    res.json({
      success: true,
      entries
    });
  } catch (error) {
    console.error('Error listing knowledge base entries:', error);
    res.status(500).json({
      error: 'Failed to list knowledge base entries',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/knowledge-base/stats
 * Get knowledge base statistics
 * Maps to IPC: knowledge-base-stats
 */
router.get('/stats', async (_req: Request, res: Response) => {
  try {
    const stats = knowledgeBaseStore.getStats();

    res.json({
      success: true,
      stats
    });
  } catch (error) {
    console.error('Error getting knowledge base stats:', error);
    res.status(500).json({
      error: 'Failed to get knowledge base stats',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/knowledge-base/companies
 * Get list of unique companies for filter dropdowns
 * Maps to IPC: knowledge-base-companies
 */
router.get('/companies', async (_req: Request, res: Response) => {
  try {
    const companies = knowledgeBaseStore.getCompanies();

    res.json({
      success: true,
      companies
    });
  } catch (error) {
    console.error('Error getting companies:', error);
    res.status(500).json({
      error: 'Failed to get companies',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/knowledge-base/job-titles
 * Get list of unique job titles for filter dropdowns
 * Maps to IPC: knowledge-base-job-titles
 */
router.get('/job-titles', async (_req: Request, res: Response) => {
  try {
    const jobTitles = knowledgeBaseStore.getJobTitles();

    res.json({
      success: true,
      jobTitles
    });
  } catch (error) {
    console.error('Error getting job titles:', error);
    res.status(500).json({
      error: 'Failed to get job titles',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/knowledge-base/:id
 * Get a single knowledge base entry by ID
 * Maps to IPC: knowledge-base-get
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const entry = knowledgeBaseStore.get(id);

    if (!entry) {
      res.status(404).json({
        error: 'Entry not found',
        message: `No knowledge base entry exists with ID: ${id}`
      });
      return;
    }

    res.json({
      success: true,
      entry
    });
  } catch (error) {
    console.error('Error getting knowledge base entry:', error);
    res.status(500).json({
      error: 'Failed to get knowledge base entry',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/knowledge-base
 * Save a new knowledge base entry
 * Maps to IPC: knowledge-base-save
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      jobTitle,
      company,
      jobDescription,
      sourceUrl,
      optimizedResume,
      analysis,
      notes,
      tags,
      // Enhanced fields (Option A)
      parsedRequirements,
      decisions,
      committeeOutput,
      metrics
    } = req.body;

    // Validate required fields
    if (!jobTitle || !company || !jobDescription || !optimizedResume || !analysis) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'jobTitle, company, jobDescription, optimizedResume, and analysis are required'
      });
      return;
    }

    // Validate analysis structure
    if (analysis.finalScore === undefined || analysis.initialScore === undefined ||
        analysis.iterations === undefined || !Array.isArray(analysis.strengths) ||
        !Array.isArray(analysis.gaps) || !Array.isArray(analysis.recommendations)) {
      res.status(400).json({
        error: 'Invalid analysis structure',
        message: 'analysis must include finalScore, initialScore, iterations, strengths[], gaps[], and recommendations[]'
      });
      return;
    }

    const entry = knowledgeBaseStore.save({
      jobTitle,
      company,
      jobDescription,
      sourceUrl,
      optimizedResume,
      analysis,
      notes,
      tags,
      parsedRequirements,
      decisions,
      committeeOutput,
      metrics
    });

    if (!entry) {
      res.status(500).json({
        error: 'Failed to save entry',
        message: 'Vault path may not be configured'
      });
      return;
    }

    res.status(201).json({
      success: true,
      entry
    });
  } catch (error) {
    console.error('Error saving knowledge base entry:', error);
    res.status(500).json({
      error: 'Failed to save knowledge base entry',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PATCH /api/knowledge-base/:id
 * Update an existing knowledge base entry (notes, tags, optimizedResume)
 * Maps to IPC: knowledge-base-update
 */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { notes, tags, optimizedResume } = req.body;

    // Ensure at least one update field is provided
    if (notes === undefined && tags === undefined && optimizedResume === undefined) {
      res.status(400).json({
        error: 'No updates provided',
        message: 'At least one of notes, tags, or optimizedResume must be provided'
      });
      return;
    }

    // Validate tags if provided
    if (tags !== undefined && !Array.isArray(tags)) {
      res.status(400).json({
        error: 'Invalid tags',
        message: 'tags must be an array of strings'
      });
      return;
    }

    const entry = knowledgeBaseStore.update(id, { notes, tags, optimizedResume });

    if (!entry) {
      res.status(404).json({
        error: 'Entry not found',
        message: `No knowledge base entry exists with ID: ${id}`
      });
      return;
    }

    res.json({
      success: true,
      entry
    });
  } catch (error) {
    console.error('Error updating knowledge base entry:', error);
    res.status(500).json({
      error: 'Failed to update knowledge base entry',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/knowledge-base/:id
 * Delete a knowledge base entry
 * Maps to IPC: knowledge-base-delete
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const deleted = knowledgeBaseStore.delete(id);

    if (!deleted) {
      res.status(404).json({
        error: 'Entry not found',
        message: `No knowledge base entry exists with ID: ${id}`
      });
      return;
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting knowledge base entry:', error);
    res.status(500).json({
      error: 'Failed to delete knowledge base entry',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/knowledge-base/:id/export
 * Export a knowledge base entry in the specified format
 * Maps to IPC: knowledge-base-export (but returns content instead of file dialog)
 *
 * Query params:
 * - format: Export format ('md' | 'json'), defaults to 'md'
 *
 * Note: PDF and DOCX exports require desktop file dialogs in the IPC handler.
 * For web clients, we return markdown or JSON for client-side handling.
 */
router.get('/:id/export', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const format = (req.query.format as string) || 'md';

    const entry = knowledgeBaseStore.get(id);

    if (!entry) {
      res.status(404).json({
        error: 'Entry not found',
        message: `No knowledge base entry exists with ID: ${id}`
      });
      return;
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${entry.company}-${entry.jobTitle}.json"`);
      res.json(entry);
      return;
    }

    // Default to markdown export
    const markdown = `# ${entry.jobTitle} at ${entry.company}

**Score:** ${(entry.analysis.finalScore * 100).toFixed(1)}%
**Created:** ${entry.createdAt}
${entry.sourceUrl ? `**Source:** ${entry.sourceUrl}` : ''}

## Optimized Resume

${entry.optimizedResume}

## Analysis

### Strengths
${entry.analysis.strengths.map(s => `- ${s}`).join('\n')}

### Gaps
${entry.analysis.gaps.map(g => `- ${g}`).join('\n')}

### Recommendations
${entry.analysis.recommendations.map(r => `- [${r.priority}] ${r.suggestion}`).join('\n')}

## Job Description

${entry.jobDescription}
${entry.notes ? `\n## Notes\n\n${entry.notes}` : ''}
${entry.tags?.length ? `\n## Tags\n\n${entry.tags.map(t => `#${t}`).join(' ')}` : ''}
`;

    res.setHeader('Content-Type', 'text/markdown');
    res.setHeader('Content-Disposition', `attachment; filename="${entry.company}-${entry.jobTitle}.md"`);
    res.send(markdown);
  } catch (error) {
    console.error('Error exporting knowledge base entry:', error);
    res.status(500).json({
      error: 'Failed to export knowledge base entry',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
