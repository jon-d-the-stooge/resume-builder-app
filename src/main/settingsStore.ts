/**
 * Settings Store Module
 *
 * Re-exports from the environment-aware settings store implementation.
 * - Electron: Uses electron-store with AES encryption
 * - Web/Node.js: Uses JSON file storage
 *
 * @see ./settingsStore/index.ts for implementation details
 */

export { settingsStore, DEFAULT_SETTINGS } from './settingsStore/index';
export type { Settings, SettingsStore, MaskedSettings } from './settingsStore/types';
