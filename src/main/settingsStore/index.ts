/**
 * Settings Store - Environment-aware export
 *
 * Automatically selects the appropriate implementation:
 * - Electron: Uses electron-store with encryption
 * - Web/Node.js: Uses JSON file storage
 */

import type { SettingsStore, Settings, MaskedSettings } from './types';

// Detect if we're running in Electron main or renderer process
function isElectron(): boolean {
  // Check for Electron-specific process property (most reliable)
  if (typeof process !== 'undefined' && process.versions && process.versions.electron) {
    return true;
  }
  // Check if we can access electron.app (main process) or electron.remote (renderer)
  try {
    const electron = require('electron');
    // In Node.js, require('electron') returns a string path, not the module
    // In Electron, it returns an object with app, ipcMain, etc.
    return typeof electron === 'object' && (electron.app !== undefined || electron.remote !== undefined);
  } catch {
    return false;
  }
}

// Conditionally load the appropriate implementation
// Using require() for conditional loading at runtime
let settingsStore: SettingsStore;

if (isElectron()) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  settingsStore = require('./electron').settingsStore;
} else {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  settingsStore = require('./web').settingsStore;
}

export { settingsStore };
export type { Settings, SettingsStore, MaskedSettings };
export { DEFAULT_SETTINGS } from './types';
