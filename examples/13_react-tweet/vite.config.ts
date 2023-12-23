import { defineConfig } from 'vite';

export default defineConfig({
  ssr: {
    // cjs module
    external: ['use-sync-external-store'],
  },
});
