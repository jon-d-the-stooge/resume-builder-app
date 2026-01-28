/**
 * Vaults routes - handles CRUD operations for vault management.
 * Endpoints for listing, creating, updating, and deleting vaults,
 * as well as vault-specific operations like file management.
 */

import { Router, Request, Response } from 'express';
import { vaultManager, settingsStore } from '../services';
import { FileExtractor } from '../../main/fileExtractor';

const router = Router();

/**
 * GET /api/vaults
 * List all vaults for the authenticated user
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const vaults = await vaultManager.getAllVaults(req.user?.id);
    res.json(vaults);
  } catch (error) {
    console.error('Error listing vaults:', error);
    res.status(500).json({
      error: 'Failed to list vaults',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/vaults
 * Create a new vault for the authenticated user
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const vaultData = req.body;
    const vault = await vaultManager.createVault(req.user?.id, vaultData);
    res.status(201).json(vault);
  } catch (error) {
    console.error('Error creating vault:', error);
    res.status(500).json({
      error: 'Failed to create vault',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/vaults/:id
 * Get a single vault by ID (only if owned by authenticated user)
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const vault = await vaultManager.getVault(req.user?.id, id);

    if (!vault) {
      res.status(404).json({
        error: 'Vault not found',
        message: `No vault exists with ID: ${id}`
      });
      return;
    }

    res.json(vault);
  } catch (error) {
    console.error('Error getting vault:', error);
    res.status(500).json({
      error: 'Failed to get vault',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/vaults/:id
 * Update a vault's profile (only if owned by authenticated user)
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const profileUpdates = req.body;
    const vault = await vaultManager.updateVaultProfile(req.user?.id, id, profileUpdates);
    res.json(vault);
  } catch (error) {
    console.error('Error updating vault:', error);

    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Vault not found',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to update vault',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/vaults/:id
 * Delete a vault (only if owned by authenticated user)
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    await vaultManager.deleteVault(req.user?.id, id);
    res.status(204).send();
  } catch (error) {
    console.error('Error deleting vault:', error);

    // Check if it's a not found error
    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        error: 'Vault not found',
        message: error.message
      });
      return;
    }

    res.status(500).json({
      error: 'Failed to delete vault',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/vaults/import-resume
 * Import a resume file and parse it into a new vault
 * Maps to IPC: process-resume (combines select-resume-file + process-resume)
 *
 * Accepts JSON body with:
 * - fileName: string - The original file name
 * - fileContent: string - Base64 encoded file content
 */
router.post('/import-resume', async (req: Request, res: Response) => {
  try {
    console.log('UPLOAD: received', req.file?.originalname);
    const { fileName, fileContent } = req.body;

    // Validate required fields
    if (!fileName || !fileContent) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'fileName and fileContent are required'
      });
      return;
    }

    // Check for API key configuration
    if (!settingsStore.hasValidKey(req.user?.id)) {
      res.status(401).json({
        error: 'API key not configured',
        message: 'Please configure your API key in Settings before processing resumes.'
      });
      return;
    }

    // Detect file format from extension
    const ext = fileName.split('.').pop()?.toLowerCase();
    const supportedFormats = ['pdf', 'docx', 'txt', 'md'];
    if (!ext || !supportedFormats.includes(ext)) {
      res.status(400).json({
        error: 'Unsupported file format',
        message: `Supported formats: ${supportedFormats.join(', ')}`
      });
      return;
    }

    // Decode base64 content
    const fileBuffer = Buffer.from(fileContent, 'base64');

    // Extract text from file
    console.log(`[Vaults] Extracting text from: ${fileName}`);
    const fileExtractor = new FileExtractor();
    const extractionResult = await fileExtractor.extractFromBuffer(fileBuffer, ext);
    const text = extractionResult.text;

    if (!text || text.trim().length === 0) {
      res.status(400).json({
        error: 'No content extracted',
        message: 'No text content could be extracted from the file'
      });
      return;
    }

    console.log(`[Vaults] Extracted ${text.length} characters from resume`);

    // Parse and import into vault
    console.log('[Vaults] Parsing resume into vault structure...');
    console.log('UPLOAD: starting parse');
    const parseResult = await vaultManager.parseAndImport(req.user?.id, text, fileName);
    console.log('UPLOAD: parse complete', parseResult);

    // Convert vault structure to response format
    const vault = parseResult.vault;
    const experienceSection = vault.sections.find(s => s.type === 'experience');
    const skillsSection = vault.sections.find(s => s.type === 'skills');
    const educationSection = vault.sections.find(s => s.type === 'education');
    const certificationsSection = vault.sections.find(s => s.type === 'certifications');

    // Build job entries from experience section objects (match review page format)
    const jobEntries = (experienceSection?.objects || []).map(obj => {
      const meta = obj.metadata as any;
      return {
        id: obj.id,
        title: meta.title || '',
        company: meta.company || '',
        location: meta.location || null,
        duration: {
          start: meta.startDate || '',
          end: meta.endDate || null
        },
        accomplishments: obj.items.map(item => ({
          id: item.id,
          description: item.content,
          parentJobId: obj.id,
          tags: item.tags || []
        })),
        skills: [], // Skills are in separate section
        confidence: 0.9
      };
    });

    // Build skills list from skills section
    const skills = (skillsSection?.objects || []).flatMap(obj =>
      obj.items.map(item => ({
        id: item.id,
        name: item.content,
        tags: item.tags || []
      }))
    );

    // Build education list
    const education = (educationSection?.objects || []).map(obj => {
      const meta = obj.metadata as any;
      return {
        id: obj.id,
        degree: meta.degree || '',
        institution: meta.institution || '',
        location: meta.location || null,
        dateRange: {
          start: meta.startDate || '',
          end: meta.endDate || ''
        },
        tags: obj.tags || []
      };
    });

    // Build certifications list
    const certifications = (certificationsSection?.objects || []).map(obj => {
      const meta = obj.metadata as any;
      return {
        id: obj.id,
        name: meta.name || '',
        issuer: meta.issuer || '',
        dateIssued: meta.issueDate || '',
        expirationDate: meta.expirationDate || null,
        tags: obj.tags || []
      };
    });

    res.status(201).json({
      success: true,
      vaultId: vault.id,
      parsedData: {
        jobEntries,
        skills,
        education,
        certifications,
        warnings: parseResult.warnings,
        confidence: {
          overall: parseResult.confidence,
          bySection: {}
        }
      }
    });

  } catch (error) {
    console.log('UPLOAD: ERROR', error);
    console.error('[Vaults] Error importing resume:', error);
    res.status(500).json({
      error: 'Failed to import resume',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
