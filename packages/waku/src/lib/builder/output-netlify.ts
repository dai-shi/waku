import path from 'node:path';
import { mkdirSync, writeFileSync } from 'node:fs';

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
    writeFileSync(
      path.join(functionsDir, 'serve.js'),
      `
export { default } from '../../${config.distDir}/${config.serveJs}';
export const config = {
  preferStatic: true,
  path: ['/', '/*'],
};
`,
    );
  }
};
