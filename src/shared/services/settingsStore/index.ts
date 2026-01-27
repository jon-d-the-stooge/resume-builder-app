/**
 * Web Settings Store Implementation
 *
 * Uses JSON file storage for settings persistence.
 * Supports per-user settings files for multi-user environments.
 *
 * NOTE: This is the pure web implementation with NO Electron dependencies.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Settings, SettingsStore, MaskedSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

// Store settings in JSON files in the project data directory
const DATA_DIR = process.env.SETTINGS_DIR || path.join(process.cwd(), 'data');

/**
 * Default user ID for backward compatibility when userId is not provided
 */
const DEFAULT_USER_ID = 'default';

/**
 * Get effective userId, falling back to default for backward compatibility
 */
function getEffectiveUserId(userId: string | undefined): string {
  return userId || DEFAULT_USER_ID;
}

/**
 * Get the settings file path for a specific user
 */
function getSettingsFilePath(userId: string): string {
  const effectiveUserId = getEffectiveUserId(userId);
  // For backward compatibility, 'default' user uses the original settings.json
  if (effectiveUserId === DEFAULT_USER_ID) {
    return path.join(DATA_DIR, 'settings.json');
  }
  return path.join(DATA_DIR, `settings-${effectiveUserId}.json`);
}

// Per-user settings cache
const userSettings: Map<string, Settings> = new Map();
const userInitialized: Map<string, boolean> = new Map();

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSettings(userId: string): void {
  const effectiveUserId = getEffectiveUserId(userId);
  ensureDataDir();
  const settingsFile = getSettingsFilePath(effectiveUserId);

  if (fs.existsSync(settingsFile)) {
    try {
      const data = fs.readFileSync(settingsFile, 'utf-8');
      const loaded = JSON.parse(data);
      userSettings.set(effectiveUserId, { ...DEFAULT_SETTINGS, ...loaded });
    } catch (error) {
      console.error(`Error loading settings for user ${effectiveUserId}:`, error);
      userSettings.set(effectiveUserId, { ...DEFAULT_SETTINGS });
    }
  } else {
    userSettings.set(effectiveUserId, { ...DEFAULT_SETTINGS });
  }
}

function saveSettings(userId: string): void {
  const effectiveUserId = getEffectiveUserId(userId);
  ensureDataDir();
  const settingsFile = getSettingsFilePath(effectiveUserId);
  const settings = userSettings.get(effectiveUserId) || { ...DEFAULT_SETTINGS };

  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (error) {
    console.error(`Error saving settings for user ${effectiveUserId}:`, error);
  }
}

function ensureInitialized(userId: string | undefined): Settings {
  const effectiveUserId = getEffectiveUserId(userId);
  if (!userInitialized.get(effectiveUserId)) {
    loadSettings(effectiveUserId);
    userInitialized.set(effectiveUserId, true);
  }
  return userSettings.get(effectiveUserId) || { ...DEFAULT_SETTINGS };
}

function getApiKeyForUser(userId: string | undefined): string {
  const settings = ensureInitialized(userId);
  return settings.llmProvider === 'anthropic'
    ? settings.anthropicApiKey
    : settings.openaiApiKey;
}

export const settingsStore: SettingsStore = {
  initialize: async (userId?: string): Promise<void> => {
    ensureInitialized(userId);
  },

  isReady: (userId?: string): boolean => {
    ensureInitialized(userId);
    return true;
  },

  get: (userId?: string): Settings => {
    const settings = ensureInitialized(userId);
    return { ...settings };
  },

  getApiKey: (userId?: string): string => {
    return getApiKeyForUser(userId);
  },

  getProvider: (userId?: string) => {
    const settings = ensureInitialized(userId);
    return settings.llmProvider;
  },

  getDefaultModel: (userId?: string) => {
    const settings = ensureInitialized(userId);
    return settings.defaultModel;
  },

  getAdzunaCredentials: (userId?: string) => {
    const settings = ensureInitialized(userId);
    const { adzunaAppId, adzunaApiKey } = settings;
    if (adzunaAppId && adzunaApiKey) {
      return { appId: adzunaAppId, apiKey: adzunaApiKey };
    }
    return null;
  },

  getJSearchApiKey: (userId?: string) => {
    const settings = ensureInitialized(userId);
    const key = settings.jsearchApiKey;
    return key && key.length > 10 ? key : null;
  },

  getMaxIterations: (userId?: string) => {
    const settings = ensureInitialized(userId);
    const value = settings.maxIterations;
    return typeof value === 'number' && value >= 1 && value <= 10 ? value : 3;
  },

  set: (userId: string | undefined, newSettings: Partial<Settings>): void => {
    const effectiveUserId = getEffectiveUserId(userId);
    const settings = ensureInitialized(userId);

    Object.entries(newSettings).forEach(([key, value]) => {
      if (value !== undefined && key in settings) {
        (settings as unknown as Record<string, unknown>)[key] = value;
      }
    });

    userSettings.set(effectiveUserId, settings);
    saveSettings(effectiveUserId);
  },

  hasValidKey: (userId?: string): boolean => {
    const key = getApiKeyForUser(userId);
    return !!key && key.length > 10;
  },

  getMasked: (userId?: string): MaskedSettings => {
    const settings = ensureInitialized(userId);
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

  clear: (userId?: string): void => {
    const effectiveUserId = getEffectiveUserId(userId);
    userSettings.set(effectiveUserId, { ...DEFAULT_SETTINGS });
    saveSettings(effectiveUserId);
  }
};

export { DEFAULT_SETTINGS };
export type { Settings, SettingsStore, MaskedSettings };
