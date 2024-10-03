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
   * Middleware to use
   * Defaults to:
   * () => [
   *   import('waku/middleware/dev-server'),
   *   import('waku/middleware/headers'),
   *   import('waku/middleware/rsc'),
   *   import('waku/middleware/ssr'),
   * ]
   */
  middleware?: () => Promise<{ default: Middleware }>[];
  /**
   * Enhancer for Hono
   * Defaults to `undefined`
   */
  unstable_honoEnhancer?:
    | (<Hono>(createApp: (app: Hono) => Hono) => (app: Hono) => Hono)
    | undefined;
}

export function defineConfig(config: Config) {
  return config;
}
