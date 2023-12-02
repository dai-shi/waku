export interface Config {
  /**
   * The project root directory.
   * Defaults to  ".".
   */
  rootDir?: string;
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
   * Defaults to  "public".
   */
  publicDir?: string;
  /**
   * The index.html file relative to srcDir or distDir.
   * Defaults to  "index.html".
   */
  indexHtml?: string;
  /**
   * The entries.js file relative to srcDir or distDir.
   * The extension should be `.js`,
   * but resolved with `.ts`, `.tsx` and `.jsx` in the development mode.
   * Defaults to  "entries.js".
   */
  entriesJs?: string;
  /**
   * Prefix for HTTP requests to indicate RSC requests.
   * Defaults to  "RSC".
   */
  rscPath?: string;
  /**
   * ssr middleware specific configs.
   */
  ssr?: {
    /**
     * A function to split HTML string into three parts.
     * The default function is to split with
     * <!--placeholder1-->...<!--/placeholder1--> and
     * <!--placeholder2-->...<!--/placeholder2-->.
     */
    splitHTML?: (htmlStr: string) => readonly [string, string, string];
  };
}
