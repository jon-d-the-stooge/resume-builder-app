/**
 * Shared types for settings store implementations
 */

import type { LLMProvider } from '../../shared/llm';

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
  initialize: () => Promise<void>;
  isReady: () => boolean;
  get: () => Settings;
  getApiKey: () => string;
  getProvider: () => LLMProvider;
  getDefaultModel: () => string | undefined;
  getAdzunaCredentials: () => { appId: string; apiKey: string } | null;
  getJSearchApiKey: () => string | null;
  getMaxIterations: () => number;
  set: (settings: Partial<Settings>) => void;
  hasValidKey: () => boolean;
  getMasked: () => MaskedSettings;
  clear: () => void;
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
