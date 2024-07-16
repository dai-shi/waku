import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';

import type { ResolvedConfig } from '../config.js';
import { DIST_PUBLIC } from './constants.js';

export const emitCloudflareOutput = async (
  rootDir: string,
  config: ResolvedConfig
) => {
  const wranglerTomlFile = path.join(rootDir, 'wrangler.toml');
  if (!existsSync(wranglerTomlFile)) {
    writeFileSync(
      wranglerTomlFile,
      `
name = "waku-project"
compatibility_date = "2024-04-05"
compatibility_flags = ["nodejs_compat"]

pages_build_output_dir = "./${config.distDir}/${DIST_PUBLIC}"
`,
    );
  }
};
