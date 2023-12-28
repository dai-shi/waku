import type { Plugin } from 'vite';

export function rscEnvPlugin({
  config,
  ssr,
}: {
  config: {
    basePath: string;
    rscPath: string;
  };
  ssr: boolean | undefined;
}): Plugin {
  return {
    name: 'rsc-env-plugin',
    config(viteConfig) {
      viteConfig.define = {
        ...viteConfig.define,
        ...Object.fromEntries([
          ...Object.entries((globalThis as any).__WAKU_PRIVATE_ENV__).flatMap(
            ([k, v]) =>
              k.startsWith('WAKU_PUBLIC_')
                ? [[`import.meta.env.${k}`, JSON.stringify(v)]]
                : [],
          ),
          [
            'import.meta.env.WAKU_CONFIG_BASE_PATH',
            JSON.stringify(config.basePath),
          ],
          [
            'import.meta.env.WAKU_CONFIG_RSC_PATH',
            JSON.stringify(config.rscPath),
          ],
          ...(ssr
            ? [['import.meta.env.WAKU_SSR_ENABLED', JSON.stringify('true')]]
            : []),
        ]),
      };
    },
  };
}
