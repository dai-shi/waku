import type { Plugin } from 'vite';
import * as dotenv from 'dotenv';

export function rscEnvPlugin({
  isDev,
  config,
}: {
  isDev: boolean;
  config?: {
    basePath: string;
    rscPath: string;
  };
}): Plugin {
  return {
    name: 'rsc-env-plugin',
    config(viteConfig) {
      if (isDev) {
        dotenv.config({
          path: ['.env.local', '.env'],
          processEnv: (globalThis as any).__WAKU_PRIVATE_ENV__,
          override: true,
        });
      }

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
          ...Object.entries((globalThis as any).__WAKU_PRIVATE_ENV__).flatMap(
            ([k, v]) =>
              k.startsWith('WAKU_PUBLIC_')
                ? [[`import.meta.env.${k}`, JSON.stringify(v)]]
                : [],
          ),
          // Node style `process.env` for traditional compatibility
          ...Object.entries((globalThis as any).__WAKU_PRIVATE_ENV__).flatMap(
            ([k, v]) =>
              k.startsWith('WAKU_PUBLIC_')
                ? [[`process.env.${k}`, JSON.stringify(v)]]
                : [],
          ),
        ]),
      };
    },
  };
}
