import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
  if (mode === 'development') {
    return {
      ssr: {
        external: ['next-mdx-remote'],
      },
    };
  }
  return {};
});
