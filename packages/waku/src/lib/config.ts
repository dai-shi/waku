import type { Config } from '../config.js';

type DeepRequired<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
    ? { [P in keyof T]-?: DeepRequired<T[P]> }
    : T;

export type ResolvedConfig = DeepRequired<Config>;

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
    middleware: DEFAULT_MIDDLEWARE,
    ...config,
  };
  return resolvedConfig;
}

export const EXTENSIONS = ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs'];
