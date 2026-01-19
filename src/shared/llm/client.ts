/**
 * LLM Client
 * 
 * Unified client for Anthropic and OpenAI LLM providers.
 * Supports structured output, caching, and retry logic.
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { jsonrepair } from 'jsonrepair';
import {
  LLMConfig,
  LLMProvider,
  LLMRequest,
  LLMResponse,
  LLMMessage,
  DEFAULT_LLM_CONFIG,
  RetryConfig,
  DEFAULT_RETRY_CONFIG
} from './types';
import { LLMCache, CacheConfig, DEFAULT_CACHE_CONFIG } from './cache';

/**
 * Unified LLM client supporting both Anthropic and OpenAI
 */
export class LLMClient {
  private config: LLMConfig;
  private anthropicClient?: Anthropic;
  private openaiClient?: OpenAI;
  private cache: LLMCache;
  private retryConfig: RetryConfig;

  constructor(
    config: Partial<LLMConfig> & { apiKey: string },
    cacheConfig: Partial<CacheConfig> = {},
    retryConfig: Partial<RetryConfig> = {}
  ) {
    // Determine provider from config or environment
    const provider: LLMProvider = config.provider || 
      (process.env.LLM_PROVIDER as LLMProvider) || 
      'anthropic';

    // Merge with defaults
    const defaults = DEFAULT_LLM_CONFIG[provider];
    this.config = {
      ...defaults,
      ...config,
      provider
    };

    // Initialize the appropriate client
    if (this.config.provider === 'anthropic') {
      this.anthropicClient = new Anthropic({
        apiKey: this.config.apiKey
      });
    } else {
      this.openaiClient = new OpenAI({
        apiKey: this.config.apiKey
      });
    }

    // Initialize cache and retry config
    this.cache = new LLMCache({ ...DEFAULT_CACHE_CONFIG, ...cacheConfig });
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  }

  /**
   * Send a completion request to the LLM
   */
  async complete(request: LLMRequest): Promise<LLMResponse> {
    const temperature = request.temperature ?? this.config.temperature;
    const maxTokens = request.maxTokens ?? this.config.maxTokens;
    const model = request.model ?? this.config.model; // Allow per-request model override
    const systemPrompt = request.systemPrompt || '';
    const debug = process.env.LLM_DEBUG === '1';

    // Extract user message (last message should be user)
    const userMessage = request.messages.find(m => m.role === 'user');
    if (!userMessage) {
      throw new Error('Request must include at least one user message');
    }

    // Check cache first
    const cached = this.cache.get(
      systemPrompt,
      userMessage.content,
      temperature,
      model
    );

    if (cached) {
      if (debug) {
        console.log('[LLM] cache hit');
      }
      return cached;
    }

    // Make the API call with retry logic
    const start = Date.now();
    if (debug) {
      console.log(
        `[LLM] request start provider=${this.config.provider} model=${model} ` +
        `temp=${temperature} maxTokens=${maxTokens} messages=${request.messages.length}`
      );
    }
    const response = await this.retryWithBackoff(async () => {
      if (this.config.provider === 'anthropic') {
        return await this.callAnthropic(request, temperature, maxTokens, model);
      } else {
        return await this.callOpenAI(request, temperature, maxTokens, model);
      }
    });
    if (debug) {
      const elapsedMs = Date.now() - start;
      const usage = response.usage
        ? ` input=${response.usage.inputTokens} output=${response.usage.outputTokens}`
        : '';
      console.log(
        `[LLM] request end model=${response.model} finish=${response.finishReason ?? 'unknown'} ` +
        `elapsedMs=${elapsedMs}${usage}`
      );
    }

    // Cache the response
    this.cache.set(
      systemPrompt,
      userMessage.content,
      temperature,
      model,
      response
    );

    return response;
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(
    request: LLMRequest,
    temperature: number,
    maxTokens: number,
    model: string
  ): Promise<LLMResponse> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized');
    }

    // Separate system prompt from messages
    const systemPrompt = request.systemPrompt || '';
    const messages = request.messages.filter(m => m.role !== 'system');

    // Convert messages to Anthropic format
    const anthropicMessages = messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }));

    const response = await this.anthropicClient.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages: anthropicMessages
    });

    // Extract text content
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Anthropic');
    }

    return {
      content: content.text,
      model: response.model,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens
      },
      finishReason: response.stop_reason || undefined
    };
  }

  /**
   * Call OpenAI API
   */
  private async callOpenAI(
    request: LLMRequest,
    temperature: number,
    maxTokens: number,
    model: string
  ): Promise<LLMResponse> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    // Build messages array with system prompt if provided
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      messages.push({
        role: 'system',
        content: request.systemPrompt
      });
    }

    // Add request messages
    messages.push(...request.messages.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content
    })));

    // Build request options
    const requestOptions: OpenAI.Chat.ChatCompletionCreateParams = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    };

    // Only use JSON mode when the prompt explicitly requests JSON output
    // Don't force JSON mode automatically - it breaks natural conversation
    const hasJsonRequest = messages.some(message => {
      const content = typeof message.content === 'string' ? message.content : '';
      // Look for explicit JSON format requests in the prompt
      return /return.*json|respond.*json|output.*json|format.*json/i.test(content);
    });

    if (hasJsonRequest) {
      const supportsJsonMode = this.config.model.includes('gpt-4-turbo') ||
                               this.config.model.includes('gpt-4o') ||
                               this.config.model.includes('gpt-3.5-turbo-1106') ||
                               this.config.model.includes('gpt-3.5-turbo-0125');

      if (supportsJsonMode) {
        requestOptions.response_format = { type: "json_object" };
      }
    }

    const response = await this.openaiClient.chat.completions.create(requestOptions);

    const choice = response.choices[0];
    if (!choice || !choice.message.content) {
      throw new Error('No content in OpenAI response');
    }

    return {
      content: choice.message.content,
      model: response.model,
      usage: response.usage ? {
        inputTokens: response.usage.prompt_tokens,
        outputTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens
      } : undefined,
      finishReason: choice.finish_reason || undefined
    };
  }

  /**
   * Retry logic with exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 0; attempt < this.retryConfig.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if we should retry
        if (this.retryConfig.shouldRetry && !this.retryConfig.shouldRetry(lastError)) {
          throw lastError;
        }

        // Don't retry on last attempt
        if (attempt === this.retryConfig.maxAttempts - 1) {
          break;
        }

        // Wait before retrying
        const delay = this.retryConfig.backoffMs[attempt] || this.retryConfig.delayMs;
        await this.sleep(delay);
      }
    }

    throw lastError || new Error('Retry failed');
  }

  /**
   * Sleep utility
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Parse JSON response from LLM, handling potential formatting issues
   */
  parseJsonResponse(text: string): any {
    try {
      // Remove markdown code blocks if present
      let cleanText = text.trim();
      
      // Handle ```json { format (space between json and brace)
      cleanText = cleanText.replace(/^```json\s+/i, '');
      // Handle ```json{ format (no space)
      cleanText = cleanText.replace(/^```json/i, '');
      // Handle ``` format
      cleanText = cleanText.replace(/^```\s*/, '');
      // Remove trailing ```
      cleanText = cleanText.replace(/\s*```$/, '');
      
      // Try parsing the cleaned text
      return JSON.parse(cleanText.trim());
    } catch (error) {
      // If still failing, try to find JSON object boundaries
      try {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          const jsonText = text.substring(firstBrace, lastBrace + 1);
          return JSON.parse(jsonText);
        }
      } catch (innerError) {
        // Fall through to error
      }
      
      // Last-resort: attempt JSON repair on the extracted or cleaned text
      try {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        const candidate = firstBrace !== -1 && lastBrace !== -1
          ? text.substring(firstBrace, lastBrace + 1)
          : text.trim();
        const repaired = jsonrepair(candidate);
        return JSON.parse(repaired);
      } catch (repairError) {
        // Fall through to detailed error
      }

      // Provide detailed error with context
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      const preview = text.substring(0, 500);
      throw new Error(
        `Failed to parse LLM response as JSON: ${errorMsg}\n\nResponse preview (first 500 chars):\n${preview}\n\nThis usually means the LLM generated malformed JSON. Try:\n1. Reducing the input size (shorter resume/job description)\n2. Using a different model\n3. Retrying the request`
      );
    }
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): { size: number; maxEntries: number; enabled: boolean } {
    return this.cache.getStats();
  }

  /**
   * Get current configuration
   */
  getConfig(): LLMConfig {
    return { ...this.config };
  }
}

/**
 * Create an LLM client from environment variables
 */
export function createLLMClientFromEnv(
  cacheConfig?: Partial<CacheConfig>,
  retryConfig?: Partial<RetryConfig>
): LLMClient {
  const provider = (process.env.LLM_PROVIDER as LLMProvider) || 'anthropic';
  const apiKey = provider === 'anthropic' 
    ? process.env.ANTHROPIC_API_KEY 
    : process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error(
      `API key not found. Set ${provider === 'anthropic' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'} environment variable.`
    );
  }

  return new LLMClient(
    {
      provider,
      apiKey,
      model: process.env.LLM_MODEL || DEFAULT_LLM_CONFIG[provider].model
    },
    cacheConfig,
    retryConfig
  );
}
