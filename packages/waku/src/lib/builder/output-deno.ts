import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';

import type { ResolvedConfig } from '../config.js';

// XXX this can be very limited. FIXME if anyone has better knowledge.
export const emitDenoOutput = async (
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
  if (!existsSync(path.join(outputDir, 'serve.ts'))) {
    writeFileSync(
      path.join(outputDir, 'serve.ts'),
      `
import { Hono } from "https://deno.land/x/hono/mod.ts";
import { serveStatic } from "https://deno.land/x/hono/middleware.ts";
import { honoMiddleware } from "npm:waku@0.18.0";

const entries = import('./${entriesFile}');

const app = new Hono();
app.use('*', honoMiddleware({ entries, ssr: ${ssr} }));
app.use("*", serveStatic({ root: "${publicDir}" }));

Deno.serve(app.fetch);
`,
    );
  }
};
