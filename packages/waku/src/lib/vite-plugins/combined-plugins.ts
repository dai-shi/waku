import rsc from '@vitejs/plugin-rsc';
import type { PluginOption } from 'vite';
import type { Config } from '../../config.js';
import { adapterAliasPlugin } from './adapter-alias.js';
import { allowServerPlugin } from './allow-server.js';
import { appEntriesPlugin } from './app-entries.js';
import { buildIdPlugin } from './build-id.js';
import { buildMetadataPlugin } from './build-metadata.js';
import { environmentsPlugin } from './environments.js';
import { extraPlugins } from './extra-plugins.js';
import { fsRouterTypegenPlugin } from './fs-router-typegen.js';
import { htmlShellPlugin } from './html-shell.js';
import { notFoundPlugin } from './not-found.js';
import { patchRsdwPlugin } from './patch-rsdw.js';
import { privateDirPlugin } from './private-dir.js';
import { rscDevtoolsPlugin } from './rsc-devtools.js';
import { staticBuildPlugin } from './static-build.js';
import { virtualConfigPlugin } from './virtual-config.js';

const hasPluginName = (plugin: PluginOption, name: string): boolean => {
  if (!plugin) {
    return false;
  }
  if (Array.isArray(plugin)) {
    return plugin.some((item) => hasPluginName(item, name));
  }
  return typeof plugin === 'object' && 'name' in plugin && plugin.name === name;
};

const excludeOverriddenPlugins = (
  config: Pick<Required<Config>, 'vite'>,
  plugins: PluginOption[],
) =>
  plugins.filter((plugin) => {
    if (!plugin || Array.isArray(plugin) || !('name' in plugin)) {
      return true;
    }
    return !hasPluginName(config.vite?.plugins, plugin.name);
  });

export function combinedPlugins(config: Required<Config>): PluginOption {
  const ourPlugins = [
    allowServerPlugin(), // apply `allowServer` DCE before "use client" transform
    rsc({
      serverHandler: false,
      keepUseCientProxy: true,
      useBuildAppHook: true,
      clientChunks: (meta) => meta.serverChunk,
    }),
    rscDevtoolsPlugin(),
    buildIdPlugin(),
    environmentsPlugin(config),
    appEntriesPlugin(config),
    virtualConfigPlugin(config),
    adapterAliasPlugin(config),
    notFoundPlugin(),
    patchRsdwPlugin(),
    buildMetadataPlugin(config),
    staticBuildPlugin(config),
    privateDirPlugin(config),
    htmlShellPlugin(),
    fsRouterTypegenPlugin(config),
  ];
  return [
    extraPlugins(config),
    ...excludeOverriddenPlugins(config, ourPlugins),
  ];
}
