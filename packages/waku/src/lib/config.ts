import type { Config } from '../config.js';

type DeepRequired<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
    ? { [P in keyof T]-?: DeepRequired<T[P]> }
    : T;

export type ResolvedConfig = DeepRequired<Config>;

const DEFAULT_HTML_HEAD = `
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
`.trim();

const DEFAULT_MIDDLEWARE = (cmd: 'dev' | 'start') => [
  ...(cmd === 'dev'
    ? [
        import(
          /* @vite-ignore */ 'DO_NOT_BUNDLE'.slice(Infinity) +
            'waku/middleware/dev-server'
        ),
      ]
    : []),
  import('waku/middleware/ssr'),
  import('waku/middleware/rsc'),
];

// Keep async function for future extension
export async function resolveConfig(config: Config) {
  const resolvedConfig: ResolvedConfig = {
    basePath: '/',
    srcDir: 'src',
    distDir: 'dist',
    publicDir: 'public',
    assetsDir: 'assets',
    ssrDir: 'ssr',
    indexHtml: 'index.html',
    mainJs: 'main.tsx',
    entriesJs: 'entries.js',
    preserveModuleDirs: ['pages', 'templates', 'routes', 'components'],
    privateDir: 'private',
    serveJs: 'serve.js',
    rscPath: 'RSC',
    htmlHead: DEFAULT_HTML_HEAD,
    middleware: DEFAULT_MIDDLEWARE,
    ...config,
  };
  return resolvedConfig;
}
