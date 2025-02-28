import type { UserConfig } from 'vite';
import type { Middleware } from './lib/middleware/types.js';

export type { Middleware };

export interface Config {
  /**
   * The base path for serve HTTP.
   * Defaults to  "/".
   * TODO https://github.com/dai-shi/waku/issues/698
   */
  basePath?: string;
  /**
   * The source directory relative to root.
   * Defaults to  "src".
   */
  srcDir?: string;
  /**
   * The dist directory relative to root.
   * This will be the folder to contain the built files.
   * Defaults to  "dist".
   */
  distDir?: string;
  /**
   * The pages directory relative to srcDir.
   * Defaults to "pages".
   */
  pagesDir?: string;
  /**
   * The private directory relative to root.
   * This folder will contain files that should be read only on the server.
   * Defaults to  "private".
   */
  privateDir?: string;
  /**
   * Bse path for HTTP requests to indicate RSC requests.
   * Defaults to "RSC".
   */
  rscBase?: string;
  /**
   * Middleware to use
   * Defaults to:
   * [
   *   'waku/middleware/context',
   *   'waku/middleware/dev-server',
   *   'waku/middleware/handler',
   * ]
   */
  middleware?: string[];
  /**
   * Enhancer for Hono
   * Defaults to `undefined`
   */
  unstable_honoEnhancer?: string | undefined;
  /**
   * Vite configuration options.
   * `common` can contains shared configs that are shallowly merged with other configs.
   * Defaults to `undefined` if not provided.
   */
  unstable_viteConfigs?:
    | {
        common?: () => UserConfig;
        'dev-main'?: () => UserConfig;
        'dev-rsc'?: () => UserConfig;
        'build-analyze'?: () => UserConfig;
        'build-server'?: () => UserConfig;
        'build-ssr'?: () => UserConfig;
        'build-client'?: () => UserConfig;
      }
    | undefined;
}

export function defineConfig(config: Config) {
  return config;
}
