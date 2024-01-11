import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  if (mode === 'development') {
    return {
      optimizeDeps: {
        include: ['react', 'jotai', 'clsx'],
      },
      ssr: {
        external: ['next-mdx-remote'],
      },
    };
  }
  return {};
});
