/**
 * Electron Settings Store Implementation
 *
 * Uses electron-store with AES encryption for secure persistent storage.
 * This implementation is only used when running in Electron context.
 */

import type { Settings, SettingsStore, MaskedSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

// Use require for electron-store v6.x (CommonJS compatible)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const Store = require('electron-store');

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
  encryptionKey: 'resume-parser-v1-secure-key',
  defaults: DEFAULT_SETTINGS
});

function getApiKey(): string {
  const settings = store.store;
  return settings.llmProvider === 'anthropic'
    ? settings.anthropicApiKey
    : settings.openaiApiKey;
}

export const settingsStore: SettingsStore = {
  initialize: async (): Promise<void> => {
    // No initialization needed for electron-store v6
  },

  isReady: (): boolean => true,

  get: (): Settings => store.store,

  getApiKey,

  getProvider: () => store.get('llmProvider'),

  getDefaultModel: () => store.get('defaultModel'),

  getAdzunaCredentials: () => {
    const appId = store.get('adzunaAppId');
    const apiKey = store.get('adzunaApiKey');
    if (appId && apiKey) {
      return { appId, apiKey };
    }
    return null;
  },

  getJSearchApiKey: () => {
    const key = store.get('jsearchApiKey');
    return key && key.length > 10 ? key : null;
  },

  getMaxIterations: () => {
    const value = store.get('maxIterations');
    return typeof value === 'number' && value >= 1 && value <= 10 ? value : 3;
  },

  set: (settings: Partial<Settings>): void => {
    Object.entries(settings).forEach(([key, value]) => {
      if (value !== undefined) {
        store.set(key as keyof Settings, value as Settings[keyof Settings]);
      }
    });
  },

  hasValidKey: (): boolean => {
    const key = getApiKey();
    return !!key && key.length > 10;
  },

  getMasked: (): MaskedSettings => {
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
      adzunaAppId: settings.adzunaAppId || '',
      adzunaApiKey: settings.adzunaApiKey
        ? '••••' + settings.adzunaApiKey.slice(-4)
        : '',
      hasAdzunaKey: !!settings.adzunaAppId && !!settings.adzunaApiKey,
      jsearchApiKey: settings.jsearchApiKey
        ? '••••' + settings.jsearchApiKey.slice(-4)
        : '',
      hasJSearchKey: !!settings.jsearchApiKey && settings.jsearchApiKey.length > 10,
      maxIterations: settings.maxIterations ?? 3
    };
  },

  clear: (): void => {
    store.clear();
  }
};
