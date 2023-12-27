import { test } from './utils.js';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, rm } from 'node:fs/promises';
import { execSync } from 'node:child_process';

const cacheDir = fileURLToPath(new URL('./.cache', import.meta.url));
const exampleDir = fileURLToPath(
  new URL('../examples/07_router', import.meta.url),
);
const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));

test.describe('07_router standalone', () => {
  const dirname = crypto.randomUUID();
  test.beforeAll('copy code', async () => {
    await mkdir(cacheDir, {
      recursive: true,
    });
    await cp(exampleDir, `${cacheDir}/${dirname}`, { recursive: true });
    // cleanup node_modules and output
    await rm(`${cacheDir}/${dirname}/node_modules`, {
      recursive: true,
      force: true,
    });
    await rm(`${cacheDir}/${dirname}/dist`, { recursive: true, force: true });
    execSync('pnpm install', {
      cwd: `${cacheDir}/${dirname}`,
      stdio: 'inherit',
    });
    // copy waku
    await cp(wakuDir, `${cacheDir}/${dirname}/node_modules/waku`, {
      recursive: true,
    });
  });

  test('should prod work', async ({ page }) => {
    // todo: fix this
    execSync('pnpm build', { cwd: `${cacheDir}/${dirname}`, stdio: 'inherit' });
  });

  test('should dev work', async ({ page }) => {
    // todo: add dev test
  });
});
