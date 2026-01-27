/**
 * Shared types for settings store implementations
 */

import type { LLMProvider } from '../../llm';

export interface Settings {
  llmProvider: LLMProvider;
  anthropicApiKey: string;
  openaiApiKey: string;
  defaultModel?: string;
  // Job Search APIs
  adzunaAppId?: string;
  adzunaApiKey?: string;
  jsearchApiKey?: string; // RapidAPI JSearch - aggregates LinkedIn, Indeed, etc.
  // Optimizer Settings
  maxIterations?: number; // Max optimization iterations (default 3)
}

export interface MaskedSettings {
  llmProvider: LLMProvider;
  anthropicApiKey: string;
  openaiApiKey: string;
  hasAnthropicKey: boolean;
  hasOpenaiKey: boolean;
  defaultModel?: string;
  adzunaAppId: string;
  adzunaApiKey: string;
  hasAdzunaKey: boolean;
  jsearchApiKey: string;
  hasJSearchKey: boolean;
  maxIterations: number;
}

export interface SettingsStore {
  initialize: (userId?: string) => Promise<void>;
  isReady: (userId?: string) => boolean;
  get: (userId?: string) => Settings;
  getApiKey: (userId?: string) => string;
  getProvider: (userId?: string) => LLMProvider;
  getDefaultModel: (userId?: string) => string | undefined;
  getAdzunaCredentials: (userId?: string) => { appId: string; apiKey: string } | null;
  getJSearchApiKey: (userId?: string) => string | null;
  getMaxIterations: (userId?: string) => number;
  set: (userId: string | undefined, settings: Partial<Settings>) => void;
  hasValidKey: (userId?: string) => boolean;
  getMasked: (userId?: string) => MaskedSettings;
  clear: (userId?: string) => void;
}

export const DEFAULT_SETTINGS: Settings = {
  llmProvider: 'anthropic',
  anthropicApiKey: '',
  openaiApiKey: '',
  defaultModel: undefined,
  adzunaAppId: '',
  adzunaApiKey: '',
  jsearchApiKey: '',
  maxIterations: 3
};
