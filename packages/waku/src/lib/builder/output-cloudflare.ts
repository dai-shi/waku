import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';

import type { ResolvedConfig } from '../config.js';

// XXX this can be very limited. FIXME if anyone has better knowledge.
export const emitCloudflareOutput = async (
  rootDir: string,
  config: ResolvedConfig,
  ssr: boolean,
) => {
  const outputDir = path.resolve('.');
  const relativeRootDir = path.relative(outputDir, rootDir);
  const entriesFile = path.join(
    relativeRootDir,
    config.distDir,
    config.entriesJs,
  );
  const publicDir = path.join(
    relativeRootDir,
    config.distDir,
    config.publicDir,
  );
  if (!existsSync(path.join(outputDir, 'serve.js'))) {
    writeFileSync(
      path.join(outputDir, 'serve.js'),
      `
import { honoMiddleware } from 'waku';
import { Hono } from 'hono';
import { serveStatic } from 'hono/cloudflare-workers';

const entries = import('./${entriesFile}');
let serveWaku;

const app = new Hono();
app.use('*', (c, next) => serveWaku(c, next));
app.use('*', serveStatic({ root: './' }));
export default {
  async fetch(request, env, ctx) {
    if (!serveWaku) {
      serveWaku = honoMiddleware({ entries, ssr: ${ssr}, env });
    }
    return app.fetch(request, env, ctx);
  }
}
`,
    );
  }
  if (!existsSync(path.join(outputDir, 'wrangler.toml'))) {
    writeFileSync(
      path.join(outputDir, 'wrangler.toml'),
      `
name = "waku-project"
main = "serve.js"
compatibility_date = "2023-12-06"

[site]
bucket = "./${publicDir}"
`,
    );
  }
};
