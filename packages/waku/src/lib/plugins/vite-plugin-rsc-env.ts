import type { Plugin } from 'vite';
import * as dotenv from 'dotenv';

export function rscEnvPlugin({
  isDev,
  env,
  config,
}: {
  isDev: boolean;
  env: Record<string, string>;
  config?: {
    basePath: string;
    rscBase: string;
  };
}): Plugin {
  return {
    name: 'rsc-env-plugin',
    config(viteConfig) {
      if (isDev) {
        dotenv.config({
          path: ['.env.local', '.env'],
          processEnv: env,
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
                  'import.meta.env.WAKU_CONFIG_RSC_BASE',
                  JSON.stringify(config.rscBase),
                ],
              ]
            : []),
          ...Object.entries(env).flatMap(([k, v]) =>
            k.startsWith('WAKU_PUBLIC_')
              ? [[`import.meta.env.${k}`, JSON.stringify(v)]]
              : [],
          ),
          // Node style `process.env` for traditional compatibility
          ...Object.entries(env).flatMap(([k, v]) =>
            k.startsWith('WAKU_PUBLIC_')
              ? [[`process.env.${k}`, JSON.stringify(v)]]
              : [],
          ),
        ]),
      };
    },
  };
}
