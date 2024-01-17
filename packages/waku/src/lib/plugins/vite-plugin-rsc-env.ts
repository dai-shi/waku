import type { Plugin } from 'vite';

export function rscEnvPlugin({
  config,
  hydrate,
}: {
  config?: {
    basePath: string;
    rscPath: string;
  };
  hydrate?: boolean | undefined;
}): Plugin {
  return {
    name: 'rsc-env-plugin',
    config(viteConfig) {
      viteConfig.define = {
        ...viteConfig.define,
        ...Object.fromEntries([
          ...(config
            ? [
                [
                  'import.meta.env.WAKU_CONFIG_BASE_PATH',
                  JSON.stringify(config.basePath),
                ],
                [
                  'import.meta.env.WAKU_CONFIG_RSC_PATH',
                  JSON.stringify(config.rscPath),
                ],
              ]
            : []),
          ...(hydrate
            ? [['import.meta.env.WAKU_HYDRATE', JSON.stringify('true')]]
            : []),
        ]),
      };
    },
  };
}
