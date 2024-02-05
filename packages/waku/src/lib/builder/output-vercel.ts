import path from 'node:path';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';

import type { ResolvedConfig } from '../config.js';

// https://vercel.com/docs/build-output-api/v3
export const emitVercelOutput = async (
  rootDir: string,
  config: ResolvedConfig,
  type: 'static' | 'serverless',
) => {
  const publicDir = path.join(rootDir, config.distDir, config.publicDir);
  const outputDir = path.resolve('.vercel', 'output');
  cpSync(publicDir, path.join(outputDir, 'static'), { recursive: true });

  if (type === 'serverless') {
    // for serverless function
    const serverlessDir = path.join(
      outputDir,
      'functions',
      config.rscPath + '.func',
    );
    mkdirSync(path.join(serverlessDir, config.distDir), {
      recursive: true,
    });
    cpSync(
      path.join(rootDir, config.distDir),
      path.join(serverlessDir, config.distDir),
      { recursive: true },
    );
    const vcConfigJson = {
      runtime: 'nodejs18.x',
      handler: `${config.distDir}/${config.serveJs}`,
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

  const routes =
    type === 'serverless'
      ? [
          { handle: 'filesystem' },
          {
            src: config.basePath + '(.*)',
            dest: config.basePath + config.rscPath + '/',
          },
        ]
      : undefined;
  const configJson = { version: 3, routes };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, 'config.json'),
    JSON.stringify(configJson, null, 2),
  );
};
