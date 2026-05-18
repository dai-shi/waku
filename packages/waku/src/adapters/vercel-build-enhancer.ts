import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const escapeRegExp = (s: string) => s.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');

export type BuildOptions = {
  assetsDir: string;
  distDir: string;
  rscBase: string;
  privateDir: string;
  basePath: string;
  DIST_PUBLIC: string;
  serverless: boolean;
};

async function postBuild({
  assetsDir,
  distDir,
  rscBase,
  privateDir,
  basePath,
  DIST_PUBLIC,
  serverless,
}: BuildOptions) {
  const SERVE_JS = 'serve-vercel.js';
  const serveCode = `
import { INTERNAL_runFetch } from './server/index.js';

const getRequestListener = globalThis.__WAKU_HONO_NODE_SERVER_GET_REQUEST_LISTENER__;

export default getRequestListener(
  (req, ...args) => INTERNAL_runFetch(process.env, req, ...args)
);
`;
  const publicDir = path.resolve(distDir, DIST_PUBLIC);
  const outputDir = path.resolve('.vercel', 'output');
  cpSync(publicDir, path.join(outputDir, 'static'), { recursive: true });

  if (serverless) {
    // for serverless function
    // TODO(waku): can use `@vercel/nft` to packaging with native dependencies
    const serverlessDir = path.join(outputDir, 'functions', rscBase + '.func');
    rmSync(serverlessDir, { recursive: true, force: true });
    mkdirSync(path.join(serverlessDir, distDir), {
      recursive: true,
    });
    writeFileSync(path.resolve(distDir, SERVE_JS), serveCode);
    cpSync(path.resolve(distDir), path.join(serverlessDir, distDir), {
      recursive: true,
    });
    if (existsSync(path.resolve(privateDir))) {
      cpSync(path.resolve(privateDir), path.join(serverlessDir, privateDir), {
        recursive: true,
        dereference: true,
      });
    }
    const vcConfigJson = {
      runtime: 'nodejs22.x',
      handler: `${distDir}/${SERVE_JS}`,
      launcherType: 'Nodejs',
    };
    writeFileSync(
      path.join(serverlessDir, '.vc-config.json'),
      JSON.stringify(vcConfigJson, null, 2),
    );
    writeFileSync(
      path.join(serverlessDir, 'package.json'),
      JSON.stringify({ type: 'module' }, null, 2),
    );
  }
  const routes = [
    {
      src: `^${escapeRegExp(basePath)}${escapeRegExp(assetsDir)}/(.*)$`,
      headers: {
        'cache-control': 'public, immutable, max-age=31536000',
      },
    },
    ...(serverless
      ? [
          { handle: 'filesystem' },
          {
            src: escapeRegExp(basePath) + '(.*)',
            dest: basePath + rscBase + '/',
          },
        ]
      : []),
  ];
  const configJson = { version: 3, routes };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, 'config.json'),
    JSON.stringify(configJson, null, 2),
  );
}

export default async function buildEnhancer(
  build: (utils: unknown, options: BuildOptions) => Promise<void>,
): Promise<typeof build> {
  return async (utils: unknown, options: BuildOptions) => {
    await build(utils, options);
    await postBuild(options);
  };
}
