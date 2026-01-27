/**
 * Web Entry Point - Pure Web Application
 *
 * This entry point is used for web-only deployments where Electron
 * is not available. All Electron-specific features are either:
 * - Replaced with web equivalents (via ipcAdapter)
 * - Gracefully disabled with user-friendly messages
 *
 * Features available in web mode:
 * - Resume parsing and content management (via REST API)
 * - Job queue and optimization (via REST API)
 * - Settings and preferences (via REST API)
 * - Applications tracking (via REST API)
 * - Knowledge base (via REST API)
 *
 * Features NOT available in web mode:
 * - Native file dialogs (use HTML file input instead)
 * - Obsidian vault integration
 * - Local file system access
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './AppRoot';
import './styles/index.css';

// Environment check - warn if Electron is accidentally loaded
if (typeof window !== 'undefined') {
  const isElectronRenderer =
    typeof process !== 'undefined' &&
    process.versions &&
    process.versions.electron;

  if (isElectronRenderer) {
    console.warn(
      '[Resume Optimizer] Running web entry point in Electron context. ' +
        'Consider using index.electron.tsx for Electron-specific features.'
    );
  }
}

// Initialize the React application
const root = document.getElementById('root');

if (!root) {
  throw new Error(
    'Root element not found. Ensure index.web.html contains <div id="root"></div>'
  );
}

ReactDOM.createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// Register service worker for PWA support (optional)
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        console.log('SW registered:', registration.scope);
      })
      .catch((error) => {
        console.log('SW registration failed:', error);
      });
  });
}
