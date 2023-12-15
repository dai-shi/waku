import type { UserConfig } from 'vite';
import {
  resolveConfig as resolveViteConfig,
  mergeConfig as mergeViteConfig,
} from 'vite';

// TODO add background and motivation https://github.com/dai-shi/waku/pull/240/files#r1426032865
export async function mergeUserViteConfig(config: UserConfig) {
  const resolvedViteConfig = await resolveViteConfig({}, 'serve');

  const mergedViteConfig = mergeViteConfig(
    {
      ...resolvedViteConfig,

      plugins: resolvedViteConfig.plugins.filter(
        (plugin) => !plugin.name.startsWith('vite:'),
      ),
    },
    config,
  );
  // vite sets terserOptions to {} in resolveViteConfig and minify to 'esbuild' at the same time which shows a warning
  if (!Object.keys(mergedViteConfig.build.terserOptions).length) {
    mergedViteConfig.build.terserOptions = null;
  }

  // HACK: Vite bug: TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received function assetsInclude
  mergedViteConfig.assetsInclude = null;
  return mergedViteConfig;
}
