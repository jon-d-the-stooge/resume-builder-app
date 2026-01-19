/**
 * Settings Store Module
 *
 * Provides encrypted persistent storage for API keys and LLM provider settings.
 * Uses electron-store with AES encryption to secure sensitive data.
 */

import type { LLMProvider } from '../shared/llm';

// Use require for electron-store v6.x (CommonJS compatible)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Store = require('electron-store');

export interface Settings {
  llmProvider: LLMProvider;
  anthropicApiKey: string;
  openaiApiKey: string;
  defaultModel?: string;
  // Job Search APIs
  adzunaAppId?: string;
  adzunaApiKey?: string;
  jsearchApiKey?: string; // RapidAPI JSearch - aggregates LinkedIn, Indeed, etc.
}

// Define the store interface for TypeScript
interface StoreInstance {
  store: Settings;
  get<K extends keyof Settings>(key: K): Settings[K];
  set<K extends keyof Settings>(key: K, value: Settings[K]): void;
  clear(): void;
}

// Create encrypted store instance
// The encryption key is used for AES-256 encryption of the store file
const store: StoreInstance = new Store({
  name: 'settings',
  encryptionKey: 'resume-parser-v1-secure-key', // Encrypts the entire store
  defaults: {
    llmProvider: 'anthropic',
    anthropicApiKey: '',
    openaiApiKey: '',
    defaultModel: undefined,
    adzunaAppId: '',
    adzunaApiKey: '',
    jsearchApiKey: ''
  }
});

/**
 * Settings store API for managing LLM provider configuration
 */
export const settingsStore = {
  /**
   * Initialize the store (no-op for v6, kept for API compatibility)
   */
  initialize: async (): Promise<void> => {
    // No initialization needed for electron-store v6
  },

  /**
   * Check if store is ready (always true for v6)
   */
  isReady: (): boolean => true,

  /**
   * Get all settings (raw values)
   */
  get: (): Settings => store.store,

  /**
   * Get the API key for the currently selected provider
   */
  getApiKey: (): string => {
    const settings = store.store;
    return settings.llmProvider === 'anthropic'
      ? settings.anthropicApiKey
      : settings.openaiApiKey;
  },

  /**
   * Get the current LLM provider
   */
  getProvider: (): LLMProvider => store.get('llmProvider'),

  /**
   * Get the default model (if set)
   */
  getDefaultModel: (): string | undefined => store.get('defaultModel'),

  /**
   * Get Adzuna API credentials
   */
  getAdzunaCredentials: (): { appId: string; apiKey: string } | null => {
    const appId = store.get('adzunaAppId');
    const apiKey = store.get('adzunaApiKey');
    if (appId && apiKey) {
      return { appId, apiKey };
    }
    return null;
  },

  /**
   * Get JSearch API key (RapidAPI)
   */
  getJSearchApiKey: (): string | null => {
    const key = store.get('jsearchApiKey');
    return key && key.length > 10 ? key : null;
  },

  /**
   * Update settings (partial update)
   */
  set: (settings: Partial<Settings>): void => {
    Object.entries(settings).forEach(([key, value]) => {
      if (value !== undefined) {
        store.set(key as keyof Settings, value as any);
      }
    });
  },

  /**
   * Check if a valid API key is configured for the current provider
   */
  hasValidKey: (): boolean => {
    const key = settingsStore.getApiKey();
    return !!key && key.length > 10;
  },

  /**
   * Get masked settings for display (hides API keys)
   */
  getMasked: () => {
    const settings = store.store;
    return {
      llmProvider: settings.llmProvider,
      anthropicApiKey: settings.anthropicApiKey
        ? '••••' + settings.anthropicApiKey.slice(-4)
        : '',
      openaiApiKey: settings.openaiApiKey
        ? '••••' + settings.openaiApiKey.slice(-4)
        : '',
      hasAnthropicKey: !!settings.anthropicApiKey && settings.anthropicApiKey.length > 10,
      hasOpenaiKey: !!settings.openaiApiKey && settings.openaiApiKey.length > 10,
      defaultModel: settings.defaultModel,
      // Adzuna
      adzunaAppId: settings.adzunaAppId || '',
      adzunaApiKey: settings.adzunaApiKey
        ? '••••' + settings.adzunaApiKey.slice(-4)
        : '',
      hasAdzunaKey: !!settings.adzunaAppId && !!settings.adzunaApiKey,
      // JSearch (RapidAPI)
      jsearchApiKey: settings.jsearchApiKey
        ? '••••' + settings.jsearchApiKey.slice(-4)
        : '',
      hasJSearchKey: !!settings.jsearchApiKey && settings.jsearchApiKey.length > 10
    };
  },

  /**
   * Clear all settings (reset to defaults)
   */
  clear: (): void => {
    store.clear();
  }
};
