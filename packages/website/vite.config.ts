import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  if (mode === 'development') {
    return {
      optimizeDeps: {
        // FIXME this causes an error with `--with-ssr`
        // include: ['@uidotdev/usehooks'],
      },
      ssr: {
        external: ['next-mdx-remote'],
      },
    };
  }
  return {};
});
