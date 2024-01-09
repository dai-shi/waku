import { defineConfig } from 'vite';

export default defineConfig(({ mode }) => {
  if (mode === 'development') {
    return {
      optimizeDeps: {
        // FIXME this causes an error with `--with-ssr`
        // include: ['jotai', 'clsx'],
        include: ['jotai', 'clsx'],
      },

      ssr: {
        external: ['next-mdx-remote'],
      },
    };
  }
  return {};
});
