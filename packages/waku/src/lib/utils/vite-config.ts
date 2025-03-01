import { mergeConfig } from 'vite';
import type { UserConfig } from 'vite';

import type { ConfigDev } from '../config.js';

const areProbablySamePlugins = (a: unknown, b: unknown): boolean => {
  if (typeof a !== 'object' || a === null) {
    return false;
  }
  if (typeof b !== 'object' || b === null) {
    return false;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    return (
      a.length === b.length &&
      a.every((item, index) => areProbablySamePlugins(item, b[index]))
    );
  }
  return 'name' in a && 'name' in b && a.name === b.name;
};

export const extendViteConfig = (
  viteConfig: UserConfig,
  configDev: ConfigDev,
  key: Exclude<keyof NonNullable<ConfigDev['unstable_viteConfigs']>, 'common'>,
) => {
  const mergedConfig = mergeConfig(viteConfig, {
    // shallow merge
    ...configDev.unstable_viteConfigs?.['common']?.(),
    ...configDev.unstable_viteConfigs?.[key]?.(),
  });
  // remove duplicate plugins (latter wins)
  mergedConfig.plugins = (mergedConfig as UserConfig).plugins?.filter(
    (plugin, index, arr) =>
      arr.findLastIndex((p) => areProbablySamePlugins(p, plugin)) === index,
  );
  return mergedConfig;
};
