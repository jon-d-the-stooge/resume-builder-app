/**
 * AI routes - handles all external AI/API proxy requests.
 *
 * These routes ensure that API keys are NEVER sent to or expected from the frontend.
 * All external API calls (Anthropic, OpenAI, RapidAPI) are proxied through these endpoints.
 */

import { Router, Request, Response } from 'express';
import { llmProxy, rapidAPIProxy } from '../services/apiProxy';
import type { LLMRequest, LLMProvider } from '../../shared/llm/types';

const router = Router();

/**
 * GET /api/ai/status
 * Check API availability status
 */
router.get('/status', (_req: Request, res: Response) => {
  const anthropicReady = llmProxy.hasProvider('anthropic');
  const openaiReady = llmProxy.hasProvider('openai');
  const rapidapiReady = rapidAPIProxy.isReady();

  res.json({
    success: true,
    providers: {
      anthropic: { available: anthropicReady },
      openai: { available: openaiReady },
      rapidapi: { available: rapidapiReady }
    },
    activeProvider: llmProxy.getProvider(),
    ready: llmProxy.isReady()
  });
});

/**
 * GET /api/ai/stats
 * Get API usage statistics
 */
router.get('/stats', (_req: Request, res: Response) => {
  res.json({
    success: true,
    llm: llmProxy.getStats(),
    rapidapi: rapidAPIProxy.getStats()
  });
});

/**
 * POST /api/ai/stats/reset
 * Reset API usage statistics
 */
router.post('/stats/reset', (_req: Request, res: Response) => {
  llmProxy.resetStats();
  rapidAPIProxy.resetStats();

  res.json({
    success: true,
    message: 'Statistics reset'
  });
});

/**
 * POST /api/ai/complete
 * Proxy LLM completion requests to Anthropic/OpenAI
 *
 * Request body:
 * - messages: Array of { role: 'user' | 'assistant', content: string }
 * - systemPrompt?: string - Optional system prompt
 * - temperature?: number - Optional temperature (0-1)
 * - maxTokens?: number - Optional max tokens
 * - model?: string - Optional model override
 * - provider?: 'anthropic' | 'openai' - Optional provider override
 */
router.post('/complete', async (req: Request, res: Response) => {
  try {
    const {
      messages,
      systemPrompt,
      temperature,
      maxTokens,
      model,
      provider
    } = req.body;

    // Validate required fields
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'messages array is required and must not be empty'
      });
      return;
    }

    // Validate messages format
    for (const msg of messages) {
      if (!msg.role || !msg.content) {
        res.status(400).json({
          error: 'Invalid message format',
          message: 'Each message must have role and content properties'
        });
        return;
      }
      if (!['user', 'assistant', 'system'].includes(msg.role)) {
        res.status(400).json({
          error: 'Invalid message role',
          message: 'Message role must be user, assistant, or system'
        });
        return;
      }
    }

    // Check if LLM proxy is ready
    if (!llmProxy.isReady()) {
      res.status(503).json({
        error: 'Service unavailable',
        message: 'No LLM API key configured on server. Set ANTHROPIC_API_KEY or OPENAI_API_KEY environment variable.'
      });
      return;
    }

    // Validate provider if specified
    if (provider && !['anthropic', 'openai'].includes(provider)) {
      res.status(400).json({
        error: 'Invalid provider',
        message: 'Provider must be anthropic or openai'
      });
      return;
    }

    // Build request
    const request: LLMRequest = {
      messages,
      systemPrompt,
      temperature,
      maxTokens,
      model
    };

    // Make the completion request
    const response = await llmProxy.complete(request, provider as LLMProvider | undefined);

    res.json({
      success: true,
      response
    });
  } catch (error) {
    console.error('[AI Routes] Completion error:', error);

    // Parse common API errors
    let statusCode = 500;
    let errorMessage = 'Unknown error';

    if (error instanceof Error) {
      errorMessage = error.message;

      if (error.message.includes('401') || error.message.includes('invalid_api_key')) {
        statusCode = 401;
        errorMessage = 'Invalid API key configured on server';
      } else if (error.message.includes('429') || error.message.includes('rate_limit')) {
        statusCode = 429;
        errorMessage = 'Rate limit exceeded';
      } else if (error.message.includes('403')) {
        statusCode = 403;
        errorMessage = 'API access forbidden';
      }
    }

    res.status(statusCode).json({
      error: 'Completion failed',
      message: errorMessage
    });
  }
});

/**
 * POST /api/ai/parse-json
 * Parse JSON from LLM response text (handles markdown code blocks, etc.)
 *
 * Request body:
 * - text: string - The raw LLM response text to parse
 */
router.post('/parse-json', (req: Request, res: Response) => {
  try {
    const { text } = req.body;

    if (!text || typeof text !== 'string') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'text string is required'
      });
      return;
    }

    const parsed = llmProxy.parseJsonResponse(text);

    res.json({
      success: true,
      data: parsed
    });
  } catch (error) {
    console.error('[AI Routes] JSON parse error:', error);
    res.status(400).json({
      error: 'Parse failed',
      message: error instanceof Error ? error.message : 'Failed to parse JSON'
    });
  }
});

/**
 * POST /api/ai/job-search
 * Proxy job search requests to JSearch (RapidAPI)
 *
 * Request body:
 * - query: string - Job search query
 * - location?: string - Optional location filter
 * - remote?: boolean - Optional remote job filter
 * - page?: number - Optional page number (default: 1)
 * - numPages?: number - Optional number of pages (default: 1)
 */
router.post('/job-search', async (req: Request, res: Response) => {
  try {
    const { query, location, remote, page, numPages } = req.body;

    // Validate required fields
    if (!query || typeof query !== 'string') {
      res.status(400).json({
        error: 'Invalid request',
        message: 'query string is required'
      });
      return;
    }

    // Check if RapidAPI proxy is ready
    if (!rapidAPIProxy.isReady()) {
      res.status(503).json({
        error: 'Service unavailable',
        message: 'RapidAPI key not configured on server. Set RAPIDAPI_KEY environment variable.'
      });
      return;
    }

    // Make the search request
    const results = await rapidAPIProxy.searchJSearch(query, {
      location,
      remote,
      page,
      numPages
    });

    res.json({
      success: true,
      results
    });
  } catch (error) {
    console.error('[AI Routes] Job search error:', error);

    let statusCode = 500;
    let errorMessage = 'Unknown error';

    if (error instanceof Error) {
      errorMessage = error.message;

      if (error.message.includes('429')) {
        statusCode = 429;
        errorMessage = 'RapidAPI rate limit exceeded';
      } else if (error.message.includes('403') || error.message.includes('401')) {
        statusCode = 403;
        errorMessage = 'RapidAPI access forbidden - check API key';
      }
    }

    res.status(statusCode).json({
      error: 'Job search failed',
      message: errorMessage
    });
  }
});

/**
 * GET /api/ai/job-details/:jobId
 * Get job details from JSearch by job ID
 */
router.get('/job-details/:jobId', async (req: Request, res: Response) => {
  try {
    const { jobId } = req.params;

    if (!jobId) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'jobId parameter is required'
      });
      return;
    }

    // Check if RapidAPI proxy is ready
    if (!rapidAPIProxy.isReady()) {
      res.status(503).json({
        error: 'Service unavailable',
        message: 'RapidAPI key not configured on server. Set RAPIDAPI_KEY environment variable.'
      });
      return;
    }

    const details = await rapidAPIProxy.getJobDetails(jobId);

    if (!details) {
      res.status(404).json({
        error: 'Not found',
        message: `Job with ID ${jobId} not found`
      });
      return;
    }

    res.json({
      success: true,
      job: details
    });
  } catch (error) {
    console.error('[AI Routes] Job details error:', error);
    res.status(500).json({
      error: 'Failed to get job details',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/ai/provider
 * Set the active LLM provider
 *
 * Request body:
 * - provider: 'anthropic' | 'openai'
 */
router.post('/provider', (req: Request, res: Response) => {
  try {
    const { provider } = req.body;

    if (!provider || !['anthropic', 'openai'].includes(provider)) {
      res.status(400).json({
        error: 'Invalid request',
        message: 'provider must be anthropic or openai'
      });
      return;
    }

    const success = llmProxy.setProvider(provider as LLMProvider);

    if (!success) {
      res.status(503).json({
        error: 'Provider unavailable',
        message: `${provider} API key not configured on server`
      });
      return;
    }

    res.json({
      success: true,
      activeProvider: llmProxy.getProvider()
    });
  } catch (error) {
    console.error('[AI Routes] Set provider error:', error);
    res.status(500).json({
      error: 'Failed to set provider',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

export default router;
