import path from 'node:path';
import { cpSync, mkdirSync, writeFileSync } from 'node:fs';

import { encodeInput } from '../renderers/utils.js';
import type { ResolvedConfig } from '../config.js';
import type { PathSpec } from '../utils/path.js';

// https://vercel.com/docs/build-output-api/v3
export const emitVercelOutput = async (
  rootDir: string,
  config: ResolvedConfig,
  staticInputs: readonly string[],
  dynamicHtmlPaths: readonly PathSpec[],
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
    staticInputs
      .map(
        (input) => config.basePath + config.rscPath + '/' + encodeInput(input),
      )
      .filter((rscPath) => !path.extname(rscPath))
      .map((rscPath) => [rscPath, { contentType: 'text/plain' }]),
  );
  const basePrefix = config.basePath + config.rscPath + '/';
  const routes =
    type === 'serverless'
      ? [
          { src: basePrefix + '(.*)', dest: basePrefix },
          ...(ssr
            ? dynamicHtmlPaths.map((pathSpec) => {
                const src =
                  '/' +
                  pathSpec
                    .map((item) =>
                      item.type === 'literal'
                        ? item.name
                        : item.type === 'group'
                          ? '[^/]+'
                          : '.*',
                    )
                    .join('/');
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
