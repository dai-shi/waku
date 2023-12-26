import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  process.env = { ...process.env, ...loadEnv(mode, process.cwd()) };
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
