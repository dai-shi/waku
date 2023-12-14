import path from 'node:path';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';

import type { ResolvedConfig } from '../config.js';

// https://vercel.com/docs/build-output-api/v3
export const emitVercelOutput = async (
  rootDir: string,
  config: ResolvedConfig,
  clientBuildOutput: { output: { fileName: string }[] },
  rscFiles: string[],
  htmlFiles: string[],
  ssr: boolean,
) => {
  const clientFiles = clientBuildOutput.output.map(({ fileName }) =>
    path.join(rootDir, config.distDir, config.publicDir, fileName),
  );
  const srcDir = path.join(rootDir, config.distDir, config.publicDir);
  const dstDir = path.resolve('.vercel', 'output');
  for (const file of [...clientFiles, ...rscFiles, ...htmlFiles]) {
    const dstFile = path.join(dstDir, 'static', path.relative(srcDir, file));
    if (!existsSync(dstFile)) {
      mkdirSync(path.dirname(dstFile), { recursive: true });
      copyFileSync(file, dstFile);
    }
  }

  // for serverless function
  const serverlessDir = path.join(
    dstDir,
    'functions',
    config.rscPath + '.func',
  );
  mkdirSync(path.join(serverlessDir, config.distDir), {
    recursive: true,
  });
  mkdirSync(path.join(serverlessDir, 'node_modules'));
  symlinkSync(
    path.relative(
      path.join(serverlessDir, 'node_modules'),
      path.join(rootDir, 'node_modules', 'waku'),
    ),
    path.join(serverlessDir, 'node_modules', 'waku'),
  );
  for (const file of readdirSync(path.join(rootDir, config.distDir))) {
    if (['.vercel'].includes(file)) {
      continue;
    }
    symlinkSync(
      path.relative(
        path.join(serverlessDir, config.distDir),
        path.join(rootDir, config.distDir, file),
      ),
      path.join(serverlessDir, config.distDir, file),
    );
  }
  const vcConfigJson = {
    runtime: 'nodejs18.x',
    handler: 'serve.js',
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
  writeFileSync(
    path.join(serverlessDir, 'serve.js'),
    `
import path from 'node:path';
import { connectMiddleware } from 'waku';
const entries = import(path.resolve('${config.distDir}', '${config.entriesJs}'));
export default async function handler(req, res) {
  connectMiddleware({ entries, ssr: ${ssr} })(req, res, () => {
    res.statusCode = 404;
    res.end();
  });
}
`,
  );

  const overrides = Object.fromEntries(
    rscFiles
      .filter((file) => !path.extname(file))
      .map((file) => [
        path.relative(srcDir, file),
        { contentType: 'text/plain' },
      ]),
  );
  const basePrefix = config.basePath + config.rscPath + '/';
  const routes = [
    { src: basePrefix + '(.*)', dest: basePrefix },
    ...(ssr
      ? htmlFiles.map((htmlFile) => {
          const file = config.basePath + path.relative(srcDir, htmlFile);
          const src = file.endsWith('/' + config.indexHtml)
            ? file.slice(0, -('/' + config.indexHtml).length) || '/'
            : file;
          return { src, dest: basePrefix };
        })
      : []),
  ];
  const configJson = { version: 3, overrides, routes };
  mkdirSync(dstDir, { recursive: true });
  writeFileSync(
    path.join(dstDir, 'config.json'),
    JSON.stringify(configJson, null, 2),
  );
};
