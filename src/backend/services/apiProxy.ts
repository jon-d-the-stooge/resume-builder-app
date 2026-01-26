/**
 * API Proxy Service
 *
 * Handles all external API calls server-side, ensuring API keys
 * are never exposed to or expected from the frontend.
 *
 * - Anthropic client wrapper with token usage logging
 * - RapidAPI client wrapper with request count logging
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import * as https from 'https';
import { jsonrepair } from 'jsonrepair';
import {
  LLMProvider,
  LLMRequest,
  LLMResponse,
  DEFAULT_LLM_CONFIG
} from '../../shared/llm/types';

/**
 * Usage statistics for tracking API consumption
 */
export interface UsageStats {
  totalRequests: number;
  totalInputTokens: number;
  totalOutputTokens: number;
  requestsByModel: Record<string, number>;
  lastRequest?: Date;
}

/**
 * RapidAPI request statistics
 */
export interface RapidAPIStats {
  totalRequests: number;
  requestsByEndpoint: Record<string, number>;
  lastRequest?: Date;
  errors: number;
}

/**
 * Anthropic/OpenAI API Proxy
 *
 * Wraps LLM provider calls using server-side API keys from environment.
 * Logs token usage per request for monitoring and cost tracking.
 */
export class LLMProxy {
  private anthropicClient: Anthropic | null = null;
  private openaiClient: OpenAI | null = null;
  private provider: LLMProvider;
  private stats: UsageStats = {
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    requestsByModel: {}
  };

  constructor() {
    // Determine provider from environment
    this.provider = (process.env.LLM_PROVIDER as LLMProvider) || 'anthropic';
    this.initializeClients();
  }

  /**
   * Initialize API clients from environment variables
   */
  private initializeClients(): void {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    if (anthropicKey) {
      this.anthropicClient = new Anthropic({ apiKey: anthropicKey });
      console.log('[LLMProxy] Anthropic client initialized');
    }

    if (openaiKey) {
      this.openaiClient = new OpenAI({ apiKey: openaiKey });
      console.log('[LLMProxy] OpenAI client initialized');
    }

    if (!anthropicKey && !openaiKey) {
      console.warn('[LLMProxy] No API keys found in environment (ANTHROPIC_API_KEY, OPENAI_API_KEY)');
    }
  }

  /**
   * Check if the proxy is ready to handle requests
   */
  isReady(): boolean {
    if (this.provider === 'anthropic') {
      return this.anthropicClient !== null;
    }
    return this.openaiClient !== null;
  }

  /**
   * Check if a specific provider is available
   */
  hasProvider(provider: LLMProvider): boolean {
    if (provider === 'anthropic') {
      return this.anthropicClient !== null;
    }
    return this.openaiClient !== null;
  }

  /**
   * Get the current provider
   */
  getProvider(): LLMProvider {
    return this.provider;
  }

  /**
   * Set the preferred provider (if available)
   */
  setProvider(provider: LLMProvider): boolean {
    if (this.hasProvider(provider)) {
      this.provider = provider;
      return true;
    }
    return false;
  }

  /**
   * Send a completion request to the LLM
   */
  async complete(request: LLMRequest, provider?: LLMProvider): Promise<LLMResponse> {
    const activeProvider = provider || this.provider;
    const model = request.model || DEFAULT_LLM_CONFIG[activeProvider].model;
    const temperature = request.temperature ?? DEFAULT_LLM_CONFIG[activeProvider].temperature;
    const maxTokens = request.maxTokens ?? DEFAULT_LLM_CONFIG[activeProvider].maxTokens;

    // Validate that we have the required client
    if (activeProvider === 'anthropic' && !this.anthropicClient) {
      throw new Error('Anthropic API key not configured. Set ANTHROPIC_API_KEY environment variable.');
    }
    if (activeProvider === 'openai' && !this.openaiClient) {
      throw new Error('OpenAI API key not configured. Set OPENAI_API_KEY environment variable.');
    }

    // Extract user message for logging
    const userMessage = request.messages.find(m => m.role === 'user');
    if (!userMessage) {
      throw new Error('Request must include at least one user message');
    }

    const start = Date.now();
    console.log(
      `[LLMProxy] Request start provider=${activeProvider} model=${model} ` +
      `temp=${temperature} maxTokens=${maxTokens}`
    );

    let response: LLMResponse;

    if (activeProvider === 'anthropic') {
      response = await this.callAnthropic(request, model, temperature, maxTokens);
    } else {
      response = await this.callOpenAI(request, model, temperature, maxTokens);
    }

    // Log usage and update stats
    const elapsedMs = Date.now() - start;
    this.updateStats(response, model);

    console.log(
      `[LLMProxy] Request complete model=${response.model} ` +
      `input=${response.usage?.inputTokens || 0} output=${response.usage?.outputTokens || 0} ` +
      `elapsedMs=${elapsedMs}`
    );

    return response;
  }

  /**
   * Call Anthropic API
   */
  private async callAnthropic(
    request: LLMRequest,
    model: string,
    temperature: number,
    maxTokens: number
  ): Promise<LLMResponse> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized');
    }

    const systemPrompt = request.systemPrompt || '';
    const messages = request.messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }));

    const response = await this.anthropicClient.messages.create({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemPrompt,
      messages
    });

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
    model: string,
    temperature: number,
    maxTokens: number
  ): Promise<LLMResponse> {
    if (!this.openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (request.systemPrompt) {
      messages.push({ role: 'system', content: request.systemPrompt });
    }

    messages.push(...request.messages.map(m => ({
      role: m.role as 'system' | 'user' | 'assistant',
      content: m.content
    })));

    const response = await this.openaiClient.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens
    });

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
   * Update usage statistics
   */
  private updateStats(response: LLMResponse, model: string): void {
    this.stats.totalRequests++;
    this.stats.lastRequest = new Date();
    this.stats.requestsByModel[model] = (this.stats.requestsByModel[model] || 0) + 1;

    if (response.usage) {
      this.stats.totalInputTokens += response.usage.inputTokens;
      this.stats.totalOutputTokens += response.usage.outputTokens;
    }
  }

  /**
   * Get current usage statistics
   */
  getStats(): UsageStats {
    return { ...this.stats };
  }

  /**
   * Reset usage statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      requestsByModel: {}
    };
  }

  /**
   * Parse JSON response from LLM, handling potential formatting issues
   */
  parseJsonResponse(text: string): unknown {
    try {
      let cleanText = text.trim();
      cleanText = cleanText.replace(/^```json\s+/i, '');
      cleanText = cleanText.replace(/^```json/i, '');
      cleanText = cleanText.replace(/^```\s*/, '');
      cleanText = cleanText.replace(/\s*```$/, '');

      return JSON.parse(cleanText.trim());
    } catch {
      // Try to find JSON object boundaries
      try {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1) {
          const jsonText = text.substring(firstBrace, lastBrace + 1);
          return JSON.parse(jsonText);
        }
      } catch {
        // Fall through
      }

      // Last resort: JSON repair
      try {
        const firstBrace = text.indexOf('{');
        const lastBrace = text.lastIndexOf('}');
        const candidate = firstBrace !== -1 && lastBrace !== -1
          ? text.substring(firstBrace, lastBrace + 1)
          : text.trim();
        const repaired = jsonrepair(candidate);
        return JSON.parse(repaired);
      } catch {
        throw new Error(`Failed to parse LLM response as JSON: ${text.substring(0, 200)}...`);
      }
    }
  }
}


/**
 * RapidAPI Proxy
 *
 * Wraps RapidAPI calls using server-side API key from environment.
 * Logs request counts per endpoint for monitoring.
 */
export class RapidAPIProxy {
  private apiKey: string | null = null;
  private stats: RapidAPIStats = {
    totalRequests: 0,
    requestsByEndpoint: {},
    errors: 0
  };

  constructor() {
    this.apiKey = process.env.RAPIDAPI_KEY || null;
    if (this.apiKey) {
      console.log('[RapidAPIProxy] Initialized with API key');
    } else {
      console.warn('[RapidAPIProxy] No RAPIDAPI_KEY found in environment');
    }
  }

  /**
   * Check if the proxy is ready
   */
  isReady(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Search jobs using JSearch API
   */
  async searchJSearch(
    query: string,
    options: {
      location?: string;
      remote?: boolean;
      page?: number;
      numPages?: number;
    } = {}
  ): Promise<JSearchResponse> {
    if (!this.apiKey) {
      throw new Error('RapidAPI key not configured. Set RAPIDAPI_KEY environment variable.');
    }

    const endpoint = 'jsearch';
    this.logRequest(endpoint);

    let searchQuery = query;
    if (options.location) {
      searchQuery += ` in ${options.location}`;
    }
    if (options.remote) {
      searchQuery += ' remote';
    }

    const params = new URLSearchParams();
    params.set('query', searchQuery);
    params.set('page', String(options.page || 1));
    params.set('num_pages', String(options.numPages || 1));

    const url = `https://jsearch.p.rapidapi.com/search?${params.toString()}`;

    console.log(`[RapidAPIProxy] JSearch request: ${searchQuery}`);

    try {
      const response = await this.fetchWithHeaders(url, {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
      });

      const data = JSON.parse(response) as JSearchResponse;
      console.log(`[RapidAPIProxy] JSearch returned ${data.data?.length || 0} results`);
      return data;
    } catch (error) {
      this.stats.errors++;
      console.error('[RapidAPIProxy] JSearch error:', error);
      throw error;
    }
  }

  /**
   * Get job details by ID from JSearch
   */
  async getJobDetails(jobId: string): Promise<JSearchJobDetails | null> {
    if (!this.apiKey) {
      throw new Error('RapidAPI key not configured. Set RAPIDAPI_KEY environment variable.');
    }

    const endpoint = 'jsearch-details';
    this.logRequest(endpoint);

    const url = `https://jsearch.p.rapidapi.com/job-details?job_id=${encodeURIComponent(jobId)}`;

    console.log(`[RapidAPIProxy] JSearch job details: ${jobId}`);

    try {
      const response = await this.fetchWithHeaders(url, {
        'X-RapidAPI-Key': this.apiKey,
        'X-RapidAPI-Host': 'jsearch.p.rapidapi.com'
      });

      const data = JSON.parse(response);
      return data.data?.[0] || null;
    } catch (error) {
      this.stats.errors++;
      console.error('[RapidAPIProxy] JSearch details error:', error);
      throw error;
    }
  }

  /**
   * HTTP fetch with custom headers
   */
  private fetchWithHeaders(url: string, headers: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      const urlObj = new URL(url);

      const options = {
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          'User-Agent': 'ResumeBuilderApp/1.0',
          'Accept': 'application/json',
          ...headers
        }
      };

      const req = https.request(options, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          const redirectUrl = res.headers.location;
          if (redirectUrl) {
            this.fetchWithHeaders(redirectUrl, headers).then(resolve).catch(reject);
            return;
          }
        }

        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          } else {
            resolve(data);
          }
        });
      });

      req.on('error', reject);
      req.setTimeout(15000, () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });
      req.end();
    });
  }

  /**
   * Log request for statistics
   */
  private logRequest(endpoint: string): void {
    this.stats.totalRequests++;
    this.stats.lastRequest = new Date();
    this.stats.requestsByEndpoint[endpoint] = (this.stats.requestsByEndpoint[endpoint] || 0) + 1;
  }

  /**
   * Get current request statistics
   */
  getStats(): RapidAPIStats {
    return { ...this.stats };
  }

  /**
   * Reset request statistics
   */
  resetStats(): void {
    this.stats = {
      totalRequests: 0,
      requestsByEndpoint: {},
      errors: 0
    };
  }
}


/**
 * JSearch API response types
 */
export interface JSearchJob {
  job_id: string;
  job_title: string;
  employer_name: string;
  employer_logo?: string;
  employer_website?: string;
  job_publisher: string;
  job_employment_type: string;
  job_apply_link: string;
  job_google_link?: string;
  job_description: string;
  job_is_remote: boolean;
  job_posted_at_datetime_utc?: string;
  job_city?: string;
  job_state?: string;
  job_country?: string;
  job_min_salary?: number;
  job_max_salary?: number;
  job_salary_currency?: string;
  job_salary_period?: string;
  job_highlights?: {
    Qualifications?: string[];
    Responsibilities?: string[];
    Benefits?: string[];
  };
  job_required_experience?: {
    no_experience_required?: boolean;
    required_experience_in_months?: number;
    experience_mentioned?: boolean;
  };
  job_required_skills?: string[];
}

export interface JSearchResponse {
  status: string;
  request_id: string;
  data: JSearchJob[];
}

export interface JSearchJobDetails extends JSearchJob {
  // Extended details from job-details endpoint
  job_benefits?: string[];
  job_required_education?: {
    postgraduate_degree?: boolean;
    professional_certification?: boolean;
    high_school?: boolean;
    associates_degree?: boolean;
    bachelors_degree?: boolean;
    degree_mentioned?: boolean;
  };
}


// Export singleton instances
export const llmProxy = new LLMProxy();
export const rapidAPIProxy = new RapidAPIProxy();
