import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';

import type { ResolvedConfig } from '../config.js';

// XXX this can be very limited. FIXME if anyone has better knowledge.
export const emitCloudflareOutput = async (
  rootDir: string,
  config: ResolvedConfig,
) => {
  const publicDir = path.join(rootDir, config.distDir, config.publicDir);
  if (!existsSync(path.join(rootDir, 'wrangler.toml'))) {
    writeFileSync(
      path.join(rootDir, 'wrangler.toml'),
      `
name = "waku-project"
main = "${config.distDir}/${config.serveJs}"
compatibility_date = "2023-12-06"

[site]
bucket = "./${publicDir}"
`,
    );
  }
};
