import type { ConfigEnv, UserConfig } from "vite";

export interface FrameworkConfig {
  /**
   * The source directry relative to root.
   * This will be the actual root in the development mode.
   * Defaults to  "src".
   */
  srcDir?: string;
  /**
   * The dist directry relative to root.
   * This will be the actual root in the production mode.
   * Defaults to  "dist".
   */
  distDir?: string;
  /**
   * The public directry relative to distDir.
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
   * The extention should be `.js`,
   * but resolved with `.ts`, `.tsx` and `.jsx` in the development mode.
   * Defaults to  "entries.js".
   */
  entriesJs?: string;
  /**
   * Prefix for HTTP requests to indicate RSC requests.
   * Defaults to  "RSC/".
   */
  rscPrefix?: string;
  /**
   * ssr middleware specific configs.
   */
  ssr?: {
    /**
     * The RSC server URL.
     * Defaults to "/".
     */
    rscServer?: string;
    /**
     * A function to split HTML string into three parts.
     * The default function is to split with
     * <!--placeholder1-->...<!--/placeholder1--> and
     * <!--placeholder2-->...<!--/placeholder2-->.
     */
    splitHTML?: (htmlStr: string) => readonly [string, string, string];
    /**
     * A function to return fallback component id for client components.
     * The default function is to use empty components with some exceptions.
     */
    getFallback?: (id: string) => string;
  };
}

export interface ExtendedUserConfig extends UserConfig {
  framework?: FrameworkConfig;
}

export function defineConfig(
  config:
    | ExtendedUserConfig
    | Promise<ExtendedUserConfig>
    | ((env: ConfigEnv) => ExtendedUserConfig)
    | ((env: ConfigEnv) => Promise<ExtendedUserConfig>)
) {
  return config;
}
