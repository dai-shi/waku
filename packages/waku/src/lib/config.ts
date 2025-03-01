import type { Config } from '../config.js';

export type ResolvedConfig = Required<Config>;

const DEFAULT_MIDDLEWARE = () => [
  import('waku/middleware/context'),
  import('waku/middleware/dev-server'),
  import('waku/middleware/handler'),
];

// Keep async function for future extension
export async function resolveConfig(config: Config) {
  const resolvedConfig: ResolvedConfig = {
    basePath: '/',
    srcDir: 'src',
    distDir: 'dist',
    pagesDir: 'pages',
    privateDir: 'private',
    rscBase: 'RSC',
    middleware: DEFAULT_MIDDLEWARE,
    unstable_honoEnhancer: undefined,
    unstable_viteConfigs: undefined,
    ...config,
  };
  return resolvedConfig;
}

export type ConfigPrd = Pick<Required<Config>, 'basePath' | 'rscBase'>;
