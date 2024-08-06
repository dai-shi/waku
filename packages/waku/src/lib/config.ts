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
const ADDITIONAL_HTML_HEAD = `
<meta name="generator" content="Waku" />
`.trim();

const DEFAULT_MIDDLEWARE = () => [
  import('waku/middleware/dev-server'),
  import('waku/middleware/headers'),
  import('waku/middleware/rsc'),
  import('waku/middleware/ssr'),
];

// Keep async function for future extension
export async function resolveConfig(config: Config) {
  const resolvedConfig: ResolvedConfig = {
    basePath: '/',
    srcDir: 'src',
    distDir: 'dist',
    preserveModuleDirs: ['pages', 'templates', 'routes', 'components'],
    privateDir: 'private',
    rscPath: 'RSC',
    htmlAttrs: '',
    htmlHead: DEFAULT_HTML_HEAD,
    middleware: DEFAULT_MIDDLEWARE,
    ...config,
  };
  if (!resolvedConfig.htmlHead.includes(ADDITIONAL_HTML_HEAD)) {
    resolvedConfig.htmlHead += ADDITIONAL_HTML_HEAD;
  }
  return resolvedConfig;
}

export const EXTENSIONS = ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs'];
