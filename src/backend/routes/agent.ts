/**
 * Agent routes - handles career agent chat and preference operations.
 * Wraps OpusAgent functionality for the web API.
 */

import { Router, Request, Response } from 'express';
import { opusAgent, JobPreference } from '../../agents';
import { vaultManager, settingsStore } from '../services';
import { loggers } from '../logger';
import type { SkillsGroupMetadata } from '../../types/vault';

const agentLogger = loggers.agent;

const router = Router();

// Valid preference types
type PreferenceType = JobPreference['type'];
const VALID_PREF_TYPES: PreferenceType[] = ['role', 'company', 'skill', 'location', 'salary', 'remote', 'industry'];

/**
 * POST /api/agent/chat
 * Send a message to the career agent
 */
router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message } = req.body;

    if (!message) {
      res.status(400).json({
        error: 'Missing required field',
        message: 'message is required'
      });
      return;
    }

    // Check API key
    if (!settingsStore.hasValidKey(req.user?.id)) {
      res.status(401).json({
        error: 'API key not configured',
        message: 'Please configure your API key in Settings.'
      });
      return;
    }

    agentLogger.info({ messageLength: message.length }, 'Agent chat request');

    await opusAgent.initialize();
    const response = await opusAgent.chat(message);

    agentLogger.info({ responseLength: response?.message?.length }, 'Agent chat response');

    res.json(response);
  } catch (error) {
    agentLogger.error({ err: error }, 'Agent chat error');
    res.json({
      message: `Error: ${(error as Error).message}`,
      confidence: 0
    });
  }
});

/**
 * GET /api/agent/preferences
 * Get agent preferences, optionally filtered by type
 */
router.get('/preferences', async (req: Request, res: Response) => {
  try {
    const typeParam = req.query.type as string | undefined;

    // Validate type parameter if provided
    let type: PreferenceType | undefined;
    if (typeParam) {
      if (VALID_PREF_TYPES.includes(typeParam as PreferenceType)) {
        type = typeParam as PreferenceType;
      } else {
        res.status(400).json({
          error: 'Invalid preference type',
          message: `Valid types: ${VALID_PREF_TYPES.join(', ')}`
        });
        return;
      }
    }

    await opusAgent.initialize();
    const preferences = opusAgent.getPreferences(type);

    res.json(preferences);
  } catch (error) {
    agentLogger.error({ err: error }, 'Get preferences error');
    res.status(500).json({
      error: 'Failed to get preferences',
      message: (error as Error).message
    });
  }
});

/**
 * POST /api/agent/preferences
 * Learn a new preference
 */
router.post('/preferences', async (req: Request, res: Response) => {
  try {
    const preference = req.body;

    await opusAgent.initialize();
    await opusAgent.learnPreference({
      ...preference,
      id: preference.id || `pref-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    res.json({ success: true });
  } catch (error) {
    agentLogger.error({ err: error }, 'Learn preference error');
    res.status(500).json({
      error: 'Failed to learn preference',
      message: (error as Error).message
    });
  }
});

/**
 * POST /api/agent/infer-skill
 * Infer and add a skill to the vault
 */
router.post('/infer-skill', async (req: Request, res: Response) => {
  try {
    const { skill, source, proficiency } = req.body;

    if (!skill) {
      res.status(400).json({
        error: 'Missing required field',
        message: 'skill is required'
      });
      return;
    }

    // Get or create a vault
    const vaults = await vaultManager.getAllVaults(req.user?.id);
    let vault = vaults[0] || null;

    if (!vault) {
      vault = await vaultManager.createVault(req.user?.id, {
        profile: {
          firstName: '',
          lastName: '',
          email: null,
          phone: null,
          location: null,
          links: [],
          headline: null
        }
      });
    }

    // Find or create skills section
    let skillsSection = vault.sections.find(s => s.type === 'skills');

    if (!skillsSection) {
      // Create skills section
      skillsSection = await vaultManager.addSection(req.user?.id, vault.id, {
        type: 'skills',
        label: 'Skills',
        displayOrder: vault.sections.length,
        vaultId: vault.id
      });
    }

    // Find or create a skills group for the category
    const category = source || 'General';
    let skillsGroup = skillsSection.objects.find(
      obj => (obj.metadata as SkillsGroupMetadata)?.category === category
    );

    if (!skillsGroup) {
      // Create skills group object
      skillsGroup = await vaultManager.addObject(req.user?.id, vault.id, skillsSection.id, {
        metadata: {
          type: 'skills-group',
          category
        } as SkillsGroupMetadata,
        displayOrder: skillsSection.objects.length,
        sectionId: skillsSection.id
      });
    }

    // Check if skill already exists
    const existingSkill = skillsGroup.items.find(
      item => item.content.toLowerCase() === skill.toLowerCase()
    );

    if (existingSkill) {
      res.json({
        success: true,
        added: false,
        message: 'Skill already exists',
        skill
      });
      return;
    }

    // Add the skill as an item
    await vaultManager.addItem(req.user?.id, vault.id, skillsGroup.id, {
      content: skill,
      displayOrder: skillsGroup.items.length,
      tags: proficiency ? [proficiency] : undefined,
      objectId: skillsGroup.id
    });

    res.json({
      success: true,
      added: true,
      skill,
      category
    });
  } catch (error) {
    agentLogger.error({ err: error }, 'Infer skill error');
    res.status(500).json({
      error: 'Failed to infer skill',
      message: (error as Error).message
    });
  }
});

/**
 * GET /api/agent/context
 * Get extended agent context including vault data and preferences
 */
router.get('/context', async (_req: Request, res: Response) => {
  try {
    await opusAgent.initialize();
    const context = await opusAgent.getExtendedContext();
    const preferences = opusAgent.getPreferences();

    res.json({
      success: true,
      context,
      preferences,
      stats: {
        preferencesCount: preferences.length,
        companiesApplied: preferences.filter(p => p.type === 'company' && p.sentiment === 'negative').length
      }
    });
  } catch (error) {
    agentLogger.error({ err: error }, 'Get context error');
    res.json({ success: false, error: (error as Error).message });
  }
});

export default router;
