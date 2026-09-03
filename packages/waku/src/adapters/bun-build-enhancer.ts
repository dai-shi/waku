import { writeFileSync } from 'node:fs';
import path from 'node:path';

export type BuildOptions = { distDir: string };

async function postBuild({ distDir }: BuildOptions) {
  const SERVE_JS = 'serve-bun.js';
  const serveCode = `
import { INTERNAL_runFetch } from './server/index.js';

Bun.serve({
  fetch: (req, ...args) => INTERNAL_runFetch(Bun.env, req, ...args),
});
`;
  writeFileSync(path.resolve(distDir, SERVE_JS), serveCode);
}

export default async function buildEnhancer(
  build: (utils: unknown, options: BuildOptions) => Promise<void>,
): Promise<typeof build> {
  return async (utils: unknown, options: BuildOptions) => {
    await build(utils, options);
    await postBuild(options);
  };
}
