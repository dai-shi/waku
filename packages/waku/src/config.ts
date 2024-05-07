import type { Middleware } from './lib/middleware/types.js';

export type { Middleware };

export interface Config {
  /**
   * The base path for serve HTTP.
   * Defaults to  "/".
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
  /**
   * The list of directries to preserve server module structure.
   * Relative to srcDir.
   * Defaults to ["pages", "templates", "routes", "components"].
   */
  preserveModuleDirs?: string[];
  /**
   * The private directory relative to root.
   * This folder will contain files that should be read only on the server.
   * Defaults to  "private".
   */
  privateDir?: string;
  /**
   * Prefix for HTTP requests to indicate RSC requests.
   * Defaults to "RSC".
   */
  rscPath?: string;
  /**
   * HTML attributes to inject.
   * Defaults to ''
   * An example is 'lang="en"'
   * This is still experimental and might be changed in the future.
   */
  htmlAttrs?: string;
  /**
   * HTML headers to inject.
   * Defaults to:
   * <meta charset="utf-8" />
   * <meta name="viewport" content="width=device-width, initial-scale=1" />
   */
  htmlHead?: string;
  /**
   * Middleware to use
   * Defaults to:
   * (cmd: 'dev' | 'start') => [
   *   ...(cmd === 'dev' ? [import('waku/middleware/dev-server')] : []),
   *   import('waku/middleware/ssr'),
   *   import('waku/middleware/rsc'),
   * ]
   */
  middleware?: (cmd: 'dev' | 'start') => Promise<{ default: Middleware }>[];
}

export function defineConfig(config: Config) {
  return config;
}
