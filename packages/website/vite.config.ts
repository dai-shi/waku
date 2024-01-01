import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  if (mode === 'development') {
    return {
      optimizeDeps: {
        include: ['@uidotdev/usehooks'],
      },
      ssr: {
        external: ['next-mdx-remote'],
      },
    };
  }
  return {};
});
