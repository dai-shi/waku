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
   * This will be the actual root in the development mode.
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
   * The public directory relative to distDir.
   * It's different from Vite's build.publicDir config.
   * Defaults to "public".
   */
  publicDir?: string;
  /**
   * The assets directory relative to distDir and publicDir.
   * Defaults to "assets".
   */
  assetsDir?: string;
  /**
   * The SSR directory relative to distDir.
   * Defaults to "ssr".
   */
  ssrDir?: string;
  /**
   * The index.html file for any directories.
   * Defaults to "index.html".
   */
  indexHtml?: string;
  /**
   * The client main file relative to srcDir.
   * Defaults to "main.tsx".
   */
  mainJs?: string;
  /**
   * The entries.js file relative to srcDir or distDir.
   * The extension should be `.js`,
   * but resolved with `.ts`, `.tsx` and `.jsx` in the development mode.
   * Defaults to "entries.js".
   */
  entriesJs?: string;
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
   * The serve.js file relative distDir.
   * This file is used for deployment.
   * Defaults to "serve.js".
   */
  serveJs?: string;
  /**
   * Prefix for HTTP requests to indicate RSC requests.
   * Defaults to "RSC".
   */
  rscPath?: string;
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
