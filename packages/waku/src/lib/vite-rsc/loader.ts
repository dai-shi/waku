import { existsSync } from 'node:fs';
import * as dotenv from 'dotenv';
import * as vite from 'vite';
import type { Config } from '../../config.js';
import { resolveConfig } from '../utils/config.js';

export function loadDotEnv() {
  dotenv.config({ path: ['.env.local', '.env'], quiet: true });
}

export async function loadConfig(): Promise<Required<Config>> {
  let config: Config | undefined;
  if (existsSync('waku.config.ts') || existsSync('waku.config.js')) {
    const imported = await vite.runnerImport<{ default: Config }>(
      '/waku.config',
    );
    config = imported.module.default;
  }
  return resolveConfig(config);
}
