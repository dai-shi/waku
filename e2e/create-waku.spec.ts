import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { test, debugChildProcess } from './utils.js';
import { expect } from '@playwright/test';

test('should create waku with default setup work', async () => {
  const cliPath = fileURLToPath(
    new URL('../packages/create-waku/dist/index.js', import.meta.url),
  );

  const dirname = crypto.randomUUID();
  await mkdir(new URL(`./.cache/${dirname}/`, import.meta.url), {
    recursive: true,
  });
  const cwd = fileURLToPath(new URL(`./.cache/${dirname}`, import.meta.url));
  const cp = spawn(process.execPath, [cliPath], {
    cwd,
    env: process.env,
  });
  debugChildProcess(cp);
  const stdin = cp.stdin!;
  await new Promise<void>((resolve) => {
    cp.stdout!.on('data', (data) => {
      const str = data.toString();
      if (str.includes('Project Name')) {
        stdin.write('\n'); // use default
      } else if (str.includes('Choose a starter template')) {
        stdin.write('\n'); // use default
      }
      if (str.includes('Done.')) {
        resolve();
      }
    });
  });
  const paths = await readdir(cwd);
  expect(paths[0]).toBe('waku-project');
  expect(paths.length).toBe(1);
  const files = await readdir(
    new URL(`./.cache/${dirname}/waku-project`, import.meta.url),
  );
  expect(files).toContain('package.json');
  expect(files).toContain('src');
  expect(files).toContain('tsconfig.json');
});
