import path from 'node:path';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';

import type { ResolvedConfig } from '../config.js';
import { DIST_PUBLIC } from './constants.js';

// https://vercel.com/docs/build-output-api/v3
export const emitVercelOutput = async (
  rootDir: string,
  config: ResolvedConfig,
  serveJs: string,
  type: 'static' | 'serverless',
) => {
  const publicDir = path.join(rootDir, config.distDir, DIST_PUBLIC);
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
    if (existsSync(path.join(rootDir, config.privateDir))) {
      cpSync(
        path.join(rootDir, config.privateDir),
        path.join(serverlessDir, config.privateDir),
        { recursive: true, dereference: true },
      );
    }
    const vcConfigJson = {
      runtime: 'nodejs20.x',
      handler: `${config.distDir}/${serveJs}`,
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
