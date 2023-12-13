import type { UserConfig } from 'vite';
import {
  resolveConfig as resolveViteConfig,
  mergeConfig as mergeViteConfig,
} from 'vite';

export async function mergeUserViteConfig(config: UserConfig) {
  const resolvedViteConfig = await resolveViteConfig({}, 'serve');

  const mergedViteConfig = await mergeViteConfig(
    {
      ...resolvedViteConfig,

      plugins: resolvedViteConfig.plugins.filter(
        (plugin) => !plugin.name.startsWith('vite:'),
      ),
    },
    config,
  );

  // HACK: Vite bug: TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received function assetsInclude
  mergedViteConfig.assetsInclude = null;
  return mergedViteConfig;
}
