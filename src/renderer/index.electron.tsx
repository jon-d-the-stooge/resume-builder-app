/**
 * Electron Entry Point - Desktop Application
 *
 * This entry point is used when running inside Electron and provides
 * access to native desktop features:
 *
 * Features available in Electron mode:
 * - All web features (via IPC → main process)
 * - Native file dialogs for file selection
 * - Obsidian vault integration
 * - Local file system access
 * - System tray / menu bar integration
 * - Native notifications
 * - Auto-updates
 *
 * The Electron renderer process communicates with the main process
 * via IPC (Inter-Process Communication) using contextBridge-exposed APIs.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './AppRoot';
import './styles/index.css';

// Verify we're running in Electron
const isElectronRenderer =
  typeof process !== 'undefined' &&
  process.versions &&
  process.versions.electron;

if (!isElectronRenderer) {
  console.warn(
    '[Resume Optimizer] Electron entry point loaded in non-Electron context. ' +
      'Native features will not be available. Consider using index.web.tsx instead.'
  );
}

// Type declaration for Electron-exposed APIs
declare global {
  interface Window {
    electronAPI?: {
      // File operations
      selectFile: (options?: {
        filters?: Array<{ name: string; extensions: string[] }>;
      }) => Promise<{ canceled: boolean; filePath?: string }>;

      selectDirectory: () => Promise<{ canceled: boolean; filePath?: string }>;

      // Vault operations
      getVaultPath: () => Promise<string | null>;
      setVaultPath: (path: string) => Promise<void>;

      // App info
      getVersion: () => Promise<string>;
      getPlatform: () => Promise<string>;

      // System
      showNotification: (title: string, body: string) => void;
      openExternal: (url: string) => Promise<void>;
    };
  }
}

// Initialize Electron-specific features
function initializeElectronFeatures(): void {
  if (!window.electronAPI) {
    console.log(
      '[Resume Optimizer] electronAPI not exposed via contextBridge. ' +
        'Running in limited mode.'
    );
    return;
  }

  // Log version info
  window.electronAPI.getVersion().then((version) => {
    console.log(`[Resume Optimizer] Electron version: ${version}`);
  });

  window.electronAPI.getPlatform().then((platform) => {
    console.log(`[Resume Optimizer] Platform: ${platform}`);
  });
}

// Initialize the React application
const root = document.getElementById('root');

if (!root) {
  throw new Error(
    'Root element not found. Ensure index.electron.html contains <div id="root"></div>'
  );
}

if (isElectronRenderer) {
  initializeElectronFeatures();
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
