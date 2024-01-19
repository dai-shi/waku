import path from 'node:path';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';

import type { ResolvedConfig } from '../config.js';

// https://vercel.com/docs/build-output-api/v3
export const emitVercelOutput = async (
  rootDir: string,
  config: ResolvedConfig,
  rscFiles: string[],
  htmlFiles: string[],
  ssr: boolean,
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

  const overrides = Object.fromEntries(
    rscFiles
      .filter((file) => !path.extname(file))
      .map((file) => [
        path.relative(publicDir, file),
        { contentType: 'text/plain' },
      ]),
  );
  const basePrefix = config.basePath + config.rscPath + '/';
  const routes =
    type === 'serverless'
      ? [
          { src: basePrefix + '(.*)', dest: basePrefix },
          ...(ssr
            ? htmlFiles.map((htmlFile) => {
                const file =
                  config.basePath + path.relative(publicDir, htmlFile);
                const src = file.endsWith('/' + config.indexHtml)
                  ? file.slice(0, -('/' + config.indexHtml).length) || '/'
                  : file;
                return { src, dest: basePrefix };
              })
            : []),
        ]
      : undefined;
  const configJson = { version: 3, overrides, routes };
  mkdirSync(outputDir, { recursive: true });
  writeFileSync(
    path.join(outputDir, 'config.json'),
    JSON.stringify(configJson, null, 2),
  );
};
