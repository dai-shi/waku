import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin, RunnableDevEnvironment, UserConfig } from 'vite';
import { mergeConfig } from 'vite';
import type { Config } from '../../config.js';
import {
  DIST_PUBLIC,
  DIST_SERVER,
  SRC_CLIENT_ENTRY,
  SRC_PAGES,
  SRC_SERVER_ENTRY,
} from '../constants.js';

const PKG_NAME = 'waku';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

export function environmentsPlugin(config: Required<Config>): Plugin {
  return {
    name: 'waku:vite-plugins:environments',
    async config(_config) {
      let viteRscConfig: UserConfig = {
        base: config.basePath,
        define: {
          'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
          'import.meta.env.WAKU_CONFIG_BASE_PATH': JSON.stringify(
            config.basePath,
          ),
          'import.meta.env.WAKU_CONFIG_RSC_BASE': JSON.stringify(
            config.rscBase,
          ),
          // CLI has loaded dotenv already at this point
          ...Object.fromEntries(
            Object.entries(process.env).flatMap(([k, v]) =>
              k.startsWith('WAKU_PUBLIC_')
                ? [
                    [`import.meta.env.${k}`, JSON.stringify(v)],
                    // TODO: defining `process.env` on client dev is not recommended.
                    // see https://github.com/vitest-dev/vitest/pull/6718
                    [`process.env.${k}`, JSON.stringify(v)],
                  ]
                : [],
            ),
          ),
        },
        environments: {
          client: {
            build: {
              rolldownOptions: {
                input: {
                  index: path.join(
                    __dirname,
                    '../vite-entries/entry.browser.js',
                  ),
                },
              },
            },
            optimizeDeps: {
              entries: [
                `${config.srcDir}/${SRC_CLIENT_ENTRY}.*`,
                `${config.srcDir}/${SRC_SERVER_ENTRY}.*`,
                `${config.srcDir}/${SRC_PAGES}/**/*.*`,
              ],
            },
          },
          ssr: {
            build: {
              rolldownOptions: {
                input: {
                  index: path.join(__dirname, '../vite-entries/entry.ssr.js'),
                },
              },
            },
          },
          rsc: {
            build: {
              rolldownOptions: {
                input: {
                  index: path.join(
                    __dirname,
                    '../vite-entries/entry.server.js',
                  ),
                  build: path.join(__dirname, '../vite-entries/entry.build.js'),
                },
              },
            },
          },
        },
      };

      if (config.vite) {
        viteRscConfig = mergeConfig(viteRscConfig, {
          ...config.vite,
          plugins: undefined,
        });
      }

      return viteRscConfig;
    },
    configEnvironment(name, environmentConfig, env) {
      // make @vitejs/plugin-rsc usable as a transitive dependency
      // by rewriting `optimizeDeps.include`. e.g.
      // include: ["@vitejs/plugin-rsc/vendor/xxx", "@vitejs/plugin-rsc > yyy"]
      // ⇓
      // include: ["waku > @vitejs/plugin-rsc/vendor/xxx", "waku > @vitejs/plugin-rsc > yyy"]
      if (environmentConfig.optimizeDeps?.include) {
        environmentConfig.optimizeDeps.include =
          environmentConfig.optimizeDeps.include.map((name) => {
            if (name.startsWith('@vitejs/plugin-rsc')) {
              name = `${PKG_NAME} > ${name}`;
            }
            return name;
          });
      }

      environmentConfig.build ??= {};
      environmentConfig.build.outDir = `${config.distDir}/${name}`;
      if (name === 'rsc') {
        environmentConfig.build.outDir = `${config.distDir}/${DIST_SERVER}`;
      }
      if (name === 'ssr') {
        environmentConfig.build.outDir = `${config.distDir}/${DIST_SERVER}/ssr`;
      }
      if (name === 'client') {
        environmentConfig.build.outDir = `${config.distDir}/${DIST_PUBLIC}`;
      }

      return {
        resolve: {
          noExternal: env.command === 'build' ? true : [PKG_NAME],
        },
        optimizeDeps: {
          exclude: [PKG_NAME, 'waku/minimal/client', 'waku/router/client'],
        },
      };
    },
    async configureServer(server) {
      const { getRequestListener } = await import('@hono/node-server');
      const environment = server.environments.rsc! as RunnableDevEnvironment;
      const entryId = (
        environment.config.build.rolldownOptions.input as { index: string }
      ).index;
      return () => {
        server.middlewares.use(async (req, res, next) => {
          try {
            // Restore Vite's automatically stripped base
            req.url = req.originalUrl;
            const mod: typeof import('../vite-entries/entry.server.js') =
              await environment.runner.import(entryId);
            await getRequestListener((req, ...args) =>
              mod.INTERNAL_runFetch(process.env, req, ...args),
            )(req, res);
          } catch (e) {
            next(e);
          }
        });
      };
    },
  };
}
