import { fileURLToPath } from 'node:url';
import { defineConfig } from 'waku/config';

const getConfig = async () => {
  // FIXME This isn't very nice. Let's revisit it later.
  // In rscEntriesPlugin, we should avoid `import('waku.config.ts')`.
  if (import.meta.env.MODE === 'production') {
    return {};
  }
  const DO_NOT_BUNDLE = '';
  const tsconfigPaths = (
    await import(/* @vite-ignore */ DO_NOT_BUNDLE + 'vite-tsconfig-paths')
  ).default;
  return {
    plugins: [
      tsconfigPaths({ root: fileURLToPath(new URL('.', import.meta.url)) }),
    ],
  };
};

export default defineConfig({
  unstable_viteConfigs: {
    'dev-main': getConfig,
    'dev-rsc': getConfig,
    'build-analyze': getConfig,
    'build-server': getConfig,
    'build-ssr': getConfig,
    'build-client': getConfig,
  },
});
