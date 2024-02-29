import path from 'node:path';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

import type { ResolvedConfig } from '../config.js';

export const emitNetlifyOutput = async (
  rootDir: string,
  config: ResolvedConfig,
  type: 'static' | 'functions',
) => {
  if (type === 'functions') {
    const functionsDir = path.join(rootDir, 'netlify/functions');
    mkdirSync(functionsDir, {
      recursive: true,
    });
    const notFoundFile = path.join(
      rootDir,
      config.distDir,
      config.publicDir,
      '404.html',
    );
    const notFoundHtml = existsSync(notFoundFile)
      ? readFileSync(notFoundFile, 'utf8')
      : null;
    writeFileSync(
      path.join(functionsDir, 'serve.js'),
      `
globalThis.__WAKU_NOT_FOUND_HTML__ = ${JSON.stringify(notFoundHtml)};
export { default } from '../../${config.distDir}/${config.serveJs}';
export const config = {
  preferStatic: true,
  path: ['/', '/*'],
};
`,
    );
  }
  const netlifyTomlFile = path.join(rootDir, 'netlify.toml');
  if (!existsSync(netlifyTomlFile)) {
    writeFileSync(
      netlifyTomlFile,
      `
[build]
  command = "npm run build -- --with-netlify"
  publish = "${config.distDir}/${config.publicDir}"
[functions]
  included_files = ["${config.privateDir}/**"]
`,
    );
  }
};
