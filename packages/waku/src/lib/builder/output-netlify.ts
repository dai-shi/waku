import path from 'node:path';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';

import type { ResolvedConfig } from '../config.js';

export const emitNetlifyOutput = async (
  rootDir: string,
  config: ResolvedConfig,
  type: 'static' | 'functions',
) => {
  if (type === 'functions') {
    const functionsDir = path.join(rootDir, 'functions');
    mkdirSync(functionsDir, {
      recursive: true,
    });
    writeFileSync(
      path.join(functionsDir, 'serve.js'),
      `
export * from '../${config.distDir}/${config.serveJs}';
`,
    );
  }
  const netlifyTomlFile = path.join(rootDir, 'netlify.toml');
  if (!existsSync(netlifyTomlFile)) {
    writeFileSync(
      netlifyTomlFile,
      `
[build]                             
  publish = "${config.distDir}/${config.publicDir}"
` +
        (type === 'functions'
          ? `
[functions]                             
  directory = "functions"       
`
          : ''),
    );
  }
};
