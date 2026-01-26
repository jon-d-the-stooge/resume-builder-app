import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',

  // Dev server settings
  server: {
    port: 5173,
    // Proxy API requests to backend during development
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },

  // Resolve aliases (match your existing paths)
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src/renderer'),
      '@shared': resolve(__dirname, 'src/shared'),
      '@types': resolve(__dirname, 'src/types'),
    },
  },

  // Output for production build
  build: {
    outDir: '../../dist/frontend',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // Web SPA entry point (React)
        web: resolve(__dirname, 'src/renderer/index.web.html'),
        // Legacy MPA entry points (vanilla JS) - kept during migration
        main: resolve(__dirname, 'src/renderer/index.html'),
        review: resolve(__dirname, 'src/renderer/review.html'),
        manualEntry: resolve(__dirname, 'src/renderer/manual-entry.html'),
        search: resolve(__dirname, 'src/renderer/search.html'),
        optimizer: resolve(__dirname, 'src/renderer/optimizer.html'),
        settings: resolve(__dirname, 'src/renderer/settings.html'),
        edit: resolve(__dirname, 'src/renderer/edit.html'),
        chat: resolve(__dirname, 'src/renderer/chat.html'),
        queue: resolve(__dirname, 'src/renderer/queue.html'),
        jobSearch: resolve(__dirname, 'src/renderer/job-search.html'),
        vault: resolve(__dirname, 'src/renderer/vault.html'),
        applications: resolve(__dirname, 'src/renderer/applications.html'),
        knowledgeBase: resolve(__dirname, 'src/renderer/knowledge-base.html'),
      },
    },
  },

  test: {
    globals: true,
    environment: 'node',
    include: ['../tests/**/*.test.ts', '../tests/**/*.spec.ts'],
  },
});
