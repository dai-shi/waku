import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  if (mode === 'development') {
    return {
      ssr: {
        external: ['next-mdx-remote'],
      },
    };
  }
  return {
    build: {
      target: ['chrome89', 'edge89', 'safari15', 'firefox89'],
    },
  };
});
