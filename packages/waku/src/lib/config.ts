import type { Config } from '../config.js';

export type ConfigDev = Required<Config>;

const DEFAULT_MIDDLEWARE = () => [
  import('waku/middleware/context'),
  import('waku/middleware/dev-server'),
  import('waku/middleware/handler'),
];

// Keep async function for future extension
export async function resolveConfigDev(config: Config) {
  const configDev: ConfigDev = {
    basePath: '/',
    srcDir: 'src',
    distDir: 'dist',
    pagesDir: 'pages',
    apiDir: 'api',
    privateDir: 'private',
    rscBase: 'RSC',
    middleware: DEFAULT_MIDDLEWARE,
    unstable_honoEnhancer: undefined,
    unstable_viteConfigs: undefined,
    ...config,
  };
  return configDev;
}

export type ConfigPrd = Pick<Required<Config>, 'basePath' | 'rscBase'>;
