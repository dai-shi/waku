import type { UserConfig, PluginOption } from 'vite';
import {
  resolveConfig as resolveViteConfig,
  mergeConfig as mergeViteConfig,
} from 'vite';

// Avoid terser warning and "path" error for each time we instantiate a vite server
// Avoid vite finding the config itself, instead, we handle it ourselves with the config argument
export async function mergeUserViteConfig(config: UserConfig) {
  const resolvedViteConfig = await resolveViteConfig({}, 'serve');
  const filterPlugins = (plugin: PluginOption[]): PluginOption[] =>
    plugin.flatMap((plugin) => {
      if (Array.isArray(plugin)) {
        return [filterPlugins(plugin)];
      }
      if (plugin && 'name' in plugin) {
        if (resolvedViteConfig.plugins.some((p) => p.name === plugin.name)) {
          return [];
        }
        return [plugin];
      }
      return [plugin];
    });

  const mergedViteConfig = mergeViteConfig(
    {
      ...resolvedViteConfig,
      configFile: false,
      // FIXME weird error around plugin duplication when removed
      plugins: resolvedViteConfig.plugins.filter(
        (plugin) =>
          ![
            'vite:css-post',
            'vite:import-analysis',
            'vite:json',
            'vite:client-inject',
          ].includes(plugin.name),
      ),
    },
    {
      ...config,
      plugins: config.plugins && filterPlugins(config.plugins),
    },
  );

  // vite sets terserOptions to {} in resolveViteConfig and minify to 'esbuild' at the same time which shows a warning
  if (!Object.keys(mergedViteConfig.build.terserOptions).length) {
    mergedViteConfig.build.terserOptions = null;
  }

  // HACK: Vite bug: TypeError [ERR_INVALID_ARG_TYPE]: The "path" argument must be of type string. Received function assetsInclude
  mergedViteConfig.assetsInclude = null;
  return mergedViteConfig;
}
