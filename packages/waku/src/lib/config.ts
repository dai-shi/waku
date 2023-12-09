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
   * The htmls directory relative to distDir.
   * Defaults to "htmls".
   */
  htmlsDir?: string;
  /**
   * The index.html file for any directories.
   * Defaults to "index.html".
   */
  indexHtml?: string;
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

type DeepRequired<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
  ? { [P in keyof T]-?: DeepRequired<T[P]> }
  : T;

export type ResolvedConfig = DeepRequired<Config>;

const splitHTML = (htmlStr: string): readonly [string, string, string] => {
  const P1 = [
    '<!--placeholder1-->\\s*<div[^>]*>',
    '</div>\\s*<!--/placeholder1-->',
  ] as const;
  const P2 = ['<!--placeholder2-->', '<!--/placeholder2-->'] as const;
  const anyRE = '[\\s\\S]*';
  const match = htmlStr.match(
    new RegExp(
      // prettier-ignore
      "^(" + anyRE + P1[0] + ")" + anyRE + "(" + P1[1] + anyRE + P2[0] + ")" + anyRE + "(" + P2[1] + anyRE + ")$",
    ),
  );
  if (match?.length !== 1 + 3) {
    throw new Error('Failed to split HTML');
  }
  return match.slice(1) as [string, string, string];
};

// Keep async function for future extension
export async function resolveConfig(config: Config) {
  const resolvedConfig: ResolvedConfig = {
    basePath: '/',
    srcDir: 'src',
    distDir: 'dist',
    publicDir: 'public',
    assetsDir: 'assets',
    htmlsDir: 'htmls',
    indexHtml: 'index.html',
    entriesJs: 'entries.js',
    rscPath: 'RSC',
    ...config,
    ssr: {
      splitHTML,
      ...config?.ssr,
    },
  };
  return resolvedConfig;
}
