import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';

import type { ResolvedConfig } from '../config.js';

// XXX this can be very limited. FIXME if anyone has better knowledge.
export const emitCloudflareOutput = async (
  rootDir: string,
  config: ResolvedConfig,
) => {
  const wranglerTomlFile = path.join(rootDir, 'wrangler.toml');
  if (!existsSync(wranglerTomlFile)) {
    writeFileSync(
      wranglerTomlFile,
      `
name = "waku-project"
main = "${config.distDir}/${config.serveJs}"
compatibility_date = "2023-12-06"
compatibility_flags = [ "nodejs_als" ]

[site]
bucket = "./${config.distDir}/${config.publicDir}"
`,
    );
  }
};
