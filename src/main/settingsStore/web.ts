/**
 * Web Settings Store Implementation
 *
 * Uses JSON file storage for settings persistence outside of Electron.
 * This is a temporary solution - will be replaced with database storage in Phase 4.
 */

import * as fs from 'fs';
import * as path from 'path';
import type { Settings, SettingsStore, MaskedSettings } from './types';
import { DEFAULT_SETTINGS } from './types';

// Store settings in a JSON file in the project data directory
const DATA_DIR = process.env.SETTINGS_DIR || path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'settings.json');

let settings: Settings = { ...DEFAULT_SETTINGS };
let initialized = false;

function ensureDataDir(): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSettings(): void {
  ensureDataDir();
  if (fs.existsSync(SETTINGS_FILE)) {
    try {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const loaded = JSON.parse(data);
      settings = { ...DEFAULT_SETTINGS, ...loaded };
    } catch (error) {
      console.error('Error loading settings:', error);
      settings = { ...DEFAULT_SETTINGS };
    }
  }
}

function saveSettings(): void {
  ensureDataDir();
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf-8');
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

function getApiKey(): string {
  return settings.llmProvider === 'anthropic'
    ? settings.anthropicApiKey
    : settings.openaiApiKey;
}

export const settingsStore: SettingsStore = {
  initialize: async (): Promise<void> => {
    if (!initialized) {
      loadSettings();
      initialized = true;
    }
  },

  isReady: (): boolean => {
    if (!initialized) {
      loadSettings();
      initialized = true;
    }
    return true;
  },

  get: (): Settings => {
    if (!initialized) {
      loadSettings();
      initialized = true;
    }
    return { ...settings };
  },

  getApiKey: (): string => {
    if (!initialized) {
      loadSettings();
      initialized = true;
    }
    return getApiKey();
  },

  getProvider: () => {
    if (!initialized) {
      loadSettings();
      initialized = true;
    }
    return settings.llmProvider;
  },

  getDefaultModel: () => {
    if (!initialized) {
      loadSettings();
      initialized = true;
    }
    return settings.defaultModel;
  },

  getAdzunaCredentials: () => {
    if (!initialized) {
      loadSettings();
      initialized = true;
    }
    const { adzunaAppId, adzunaApiKey } = settings;
    if (adzunaAppId && adzunaApiKey) {
      return { appId: adzunaAppId, apiKey: adzunaApiKey };
    }
    return null;
  },

  getJSearchApiKey: () => {
    if (!initialized) {
      loadSettings();
      initialized = true;
    }
    const key = settings.jsearchApiKey;
    return key && key.length > 10 ? key : null;
  },

  getMaxIterations: () => {
    if (!initialized) {
      loadSettings();
      initialized = true;
    }
    const value = settings.maxIterations;
    return typeof value === 'number' && value >= 1 && value <= 10 ? value : 3;
  },

  set: (newSettings: Partial<Settings>): void => {
    if (!initialized) {
      loadSettings();
      initialized = true;
    }
    Object.entries(newSettings).forEach(([key, value]) => {
      if (value !== undefined && key in settings) {
        (settings as unknown as Record<string, unknown>)[key] = value;
      }
    });
    saveSettings();
  },

  hasValidKey: (): boolean => {
    if (!initialized) {
      loadSettings();
      initialized = true;
    }
    const key = getApiKey();
    return !!key && key.length > 10;
  },

  getMasked: (): MaskedSettings => {
    if (!initialized) {
      loadSettings();
      initialized = true;
    }
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
    settings = { ...DEFAULT_SETTINGS };
    saveSettings();
  }
};
