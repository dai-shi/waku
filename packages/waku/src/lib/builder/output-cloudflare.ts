import path from 'node:path';
import { existsSync, writeFileSync } from 'node:fs';
import { joinPath } from '../utils/path.js';
import { DIST_ASSETS, DIST_PUBLIC } from './constants.js';

import type { ResolvedConfig } from '../config.js';

export const emitCloudflareOutput = async (
  rootDir: string,
  config: ResolvedConfig
) => {
  const routesJsonPublicFile = joinPath(rootDir, config.srcDir, DIST_PUBLIC);
  if (!existsSync(routesJsonPublicFile)) {
    const routesJsonDistFile = joinPath(rootDir,
      config.distDir,
      '_routes.json');
    const staticRoutes = {
      version: 1,
      include: ['/*'],
      exclude: [`/${DIST_PUBLIC}/${DIST_ASSETS}/*`]
    };

    writeFileSync(routesJsonDistFile, JSON.stringify(staticRoutes));
  }

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
