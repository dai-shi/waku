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
   * This will be the actual root in the production mode.
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
}

export function defineConfig(config: Config) {
  return config;
}
