import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  if (mode === 'development') {
    return {
      ssr: {
        external: ['next-mdx-remote'],
      },
    };
  }
  return {};
});
