import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: './src/renderer',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
    rollupOptions: {
      input: {
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
        vault: resolve(__dirname, 'src/renderer/vault.html')
      }
    }
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['../tests/**/*.test.ts', '../tests/**/*.spec.ts']
  }
});
