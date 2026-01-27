/**
 * Settings routes - handles user settings and API key management.
 * Maps IPC handlers (get-settings, save-settings, validate-api-key,
 * check-api-key-configured) to REST endpoints.
 */

import { Router, Request, Response } from 'express';
import { settingsStore } from '../services';
import { LLMClient } from '../../shared/llm/client';
import type { LLMProvider } from '../../shared/llm';

const router = Router();

/**
 * GET /api/settings
 * Get current settings with masked API keys
 * Maps to IPC: get-settings
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    // Ensure store is initialized
    if (!settingsStore.isReady(req.user?.id)) {
      await settingsStore.initialize(req.user?.id);
    }

    const maskedSettings = settingsStore.getMasked(req.user?.id);

    res.json({
      success: true,
      settings: maskedSettings
    });
  } catch (error) {
    console.error('Error getting settings:', error);
    res.status(500).json({
      error: 'Failed to get settings',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * PUT /api/settings
 * Update settings
 * Maps to IPC: save-settings
 */
router.put('/', async (req: Request, res: Response) => {
  try {
    // Ensure store is initialized
    if (!settingsStore.isReady(req.user?.id)) {
      await settingsStore.initialize(req.user?.id);
    }

    const {
      llmProvider,
      anthropicApiKey,
      openaiApiKey,
      defaultModel,
      jsearchApiKey,
      adzunaAppId,
      adzunaApiKey,
      maxIterations
    } = req.body;

    // Validate llmProvider if provided
    const validProviders: LLMProvider[] = ['anthropic', 'openai'];
    if (llmProvider && !validProviders.includes(llmProvider)) {
      res.status(400).json({
        error: 'Invalid LLM provider',
        message: `Provider must be one of: ${validProviders.join(', ')}`
      });
      return;
    }

    // Validate maxIterations if provided
    if (maxIterations !== undefined) {
      if (typeof maxIterations !== 'number' || maxIterations < 1 || maxIterations > 10) {
        res.status(400).json({
          error: 'Invalid maxIterations',
          message: 'maxIterations must be a number between 1 and 10'
        });
        return;
      }
    }

    // Build update object with only provided fields
    const updates: Record<string, any> = {};
    if (llmProvider !== undefined) updates.llmProvider = llmProvider;
    if (anthropicApiKey !== undefined) updates.anthropicApiKey = anthropicApiKey;
    if (openaiApiKey !== undefined) updates.openaiApiKey = openaiApiKey;
    if (defaultModel !== undefined) updates.defaultModel = defaultModel;
    if (jsearchApiKey !== undefined) updates.jsearchApiKey = jsearchApiKey;
    if (adzunaAppId !== undefined) updates.adzunaAppId = adzunaAppId;
    if (adzunaApiKey !== undefined) updates.adzunaApiKey = adzunaApiKey;
    if (maxIterations !== undefined) updates.maxIterations = maxIterations;

    settingsStore.set(req.user?.id, updates);

    res.json({
      success: true
    });
  } catch (error) {
    console.error('Error saving settings:', error);
    res.status(500).json({
      error: 'Failed to save settings',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/settings/validate-api-key
 * Validate an API key by making a test call to the provider
 * Maps to IPC: validate-api-key
 */
router.post('/validate-api-key', async (req: Request, res: Response) => {
  try {
    const { provider, apiKey } = req.body;

    // Validate required fields
    if (!provider || !apiKey) {
      res.status(400).json({
        error: 'Missing required fields',
        message: 'provider and apiKey are required'
      });
      return;
    }

    // Validate provider
    const validProviders: LLMProvider[] = ['anthropic', 'openai'];
    if (!validProviders.includes(provider)) {
      res.status(400).json({
        error: 'Invalid provider',
        message: `Provider must be one of: ${validProviders.join(', ')}`
      });
      return;
    }

    // Create a temporary client to validate the key
    const client = new LLMClient({
      provider,
      apiKey
    });

    // Make a minimal test request
    const response = await client.complete({
      messages: [{ role: 'user', content: 'test' }],
      maxTokens: 5
    });

    if (response.content) {
      res.json({
        valid: true
      });
    } else {
      res.json({
        valid: false,
        error: 'Empty response from provider'
      });
    }
  } catch (error) {
    console.error('Error validating API key:', error);

    // Parse common API errors
    let errorMessage = 'Unknown validation error';
    if (error instanceof Error) {
      if (error.message.includes('401') || error.message.includes('invalid_api_key') ||
          error.message.includes('Incorrect API key')) {
        errorMessage = 'Invalid API key';
      } else if (error.message.includes('429') || error.message.includes('rate_limit')) {
        errorMessage = 'Rate limited - key may be valid but quota exceeded';
      } else if (error.message.includes('403')) {
        errorMessage = 'API key does not have access to this resource';
      } else {
        errorMessage = error.message;
      }
    }

    res.json({
      valid: false,
      error: errorMessage
    });
  }
});

/**
 * GET /api/settings/api-key-status
 * Check if a valid API key is configured
 * Maps to IPC: check-api-key-configured
 */
router.get('/api-key-status', async (req: Request, res: Response) => {
  try {
    // Ensure store is initialized
    if (!settingsStore.isReady(req.user?.id)) {
      await settingsStore.initialize(req.user?.id);
    }

    const configured = settingsStore.hasValidKey(req.user?.id);
    const provider = settingsStore.getProvider(req.user?.id);

    res.json({
      configured,
      provider
    });
  } catch (error) {
    console.error('Error checking API key status:', error);
    res.status(500).json({
      error: 'Failed to check API key status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/settings/job-search-credentials
 * Get job search API credentials status (without exposing actual keys)
 */
router.get('/job-search-credentials', async (req: Request, res: Response) => {
  try {
    // Ensure store is initialized
    if (!settingsStore.isReady(req.user?.id)) {
      await settingsStore.initialize(req.user?.id);
    }

    const adzuna = settingsStore.getAdzunaCredentials(req.user?.id);
    const jsearchKey = settingsStore.getJSearchApiKey(req.user?.id);

    res.json({
      success: true,
      adzuna: {
        configured: !!adzuna
      },
      jsearch: {
        configured: !!jsearchKey
      }
    });
  } catch (error) {
    console.error('Error getting job search credentials status:', error);
    res.status(500).json({
      error: 'Failed to get job search credentials status',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * DELETE /api/settings
 * Clear all settings (reset to defaults)
 */
router.delete('/', async (req: Request, res: Response) => {
  try {
    // Ensure store is initialized
    if (!settingsStore.isReady(req.user?.id)) {
      await settingsStore.initialize(req.user?.id);
    }

    settingsStore.clear(req.user?.id);

    res.json({
      success: true,
      message: 'Settings cleared and reset to defaults'
    });
  } catch (error) {
    console.error('Error clearing settings:', error);
    res.status(500).json({
      error: 'Failed to clear settings',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
