import path from 'node:path';
import { writeFileSync } from 'node:fs';
import type { ResolvedConfig } from '../config.js';

export const emitAwsLambdaOutput = async (config: ResolvedConfig) => {
  writeFileSync(
    path.join(config.distDir, 'package.json'),
    JSON.stringify({ type: 'module' }, null, 2),
  );
};
