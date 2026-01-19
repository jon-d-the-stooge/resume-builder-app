/**
 * LLM Types
 * 
 * Type definitions for LLM configuration and responses.
 * Supports both Anthropic and OpenAI providers.
 */

/**
 * Supported LLM providers
 */
export type LLMProvider = 'anthropic' | 'openai';

/**
 * LLM configuration
 */
export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  timeout: number; // milliseconds
}

/**
 * Default configurations for each provider
 */
export const DEFAULT_LLM_CONFIG: Record<LLMProvider, Omit<LLMConfig, 'apiKey'>> = {
  anthropic: {
    provider: 'anthropic',
    model: 'claude-sonnet-4-20250514',
    temperature: 0,
    maxTokens: 4096,
    timeout: 30000
  },
  openai: {
    provider: 'openai',
    model: 'gpt-4o',
    temperature: 0,
    maxTokens: 4096,
    timeout: 30000
  }
};

/**
 * Message role for chat-based LLM interactions
 */
export type MessageRole = 'system' | 'user' | 'assistant';

/**
 * Message structure for LLM interactions
 */
export interface LLMMessage {
  role: MessageRole;
  content: string;
}

/**
 * LLM request parameters
 */
export interface LLMRequest {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  model?: string; // Override the default model for this request
}

/**
 * LLM response structure
 */
export interface LLMResponse {
  content: string;
  model: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
  finishReason?: string;
}

/**
 * Retry configuration for LLM calls
 */
export interface RetryConfig {
  maxAttempts: number;
  delayMs: number;
  backoffMs: number[];
  shouldRetry?: (error: Error) => boolean;
}

/**
 * Default retry configuration
 */
export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  delayMs: 1000,
  backoffMs: [1000, 2000, 4000]
};
