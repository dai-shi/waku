import type { Config } from '../config.js';

type DeepRequired<T> = T extends (...args: any[]) => any
  ? T
  : T extends object
    ? { [P in keyof T]-?: DeepRequired<T[P]> }
    : T;

export type ResolvedConfig = DeepRequired<Config>;

export type PureConfig = Omit<
  DeepRequired<Config>,
  'middleware' | 'unstable_honoEnhancer'
>;

const DEFAULT_MIDDLEWARE = () => [
  import('waku/middleware/context'),
  import('waku/middleware/dev-server'),
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
    rscBase: 'RSC',
    middleware: DEFAULT_MIDDLEWARE,
    unstable_honoEnhancer: undefined,
    ...config,
  };
  return resolvedConfig;
}
