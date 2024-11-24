import { expect } from '@playwright/test';
import { execSync, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import waitPort from 'wait-port';

import { debugChildProcess, getFreePort, terminate, test } from './utils.js';

let standaloneDir: string;
const fixtureDir = fileURLToPath(
  new URL('./fixtures/ssr-catch-error', import.meta.url),
);
const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));
const { version } = createRequire(import.meta.url)(
  join(wakuDir, 'package.json'),
);

async function run(isDev: boolean) {
  const port = await getFreePort();
  const cp = isDev
    ? exec(
        `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} dev --port ${port}`,
        { cwd: standaloneDir },
      )
    : exec(
        `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} build && node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} start --port ${port}`,
        { cwd: standaloneDir },
      );
  debugChildProcess(cp, fileURLToPath(import.meta.url), [
    /ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time/,
  ]);
  await waitPort({ port });
  return [port, cp.pid];
}

for (const isDev of [true, false]) {
  test.describe(`ssr-catch-error: ${isDev ? 'DEV' : 'PRD'}`, () => {
    test.beforeEach(async () => {
      // GitHub Action on Windows doesn't support mkdtemp on global temp dir,
      // Which will cause files in `src` folder to be empty.
      // I don't know why
      const tmpDir = process.env.TEMP_DIR ? process.env.TEMP_DIR : tmpdir();
      standaloneDir = await mkdtemp(join(tmpDir, 'waku-ssr-catch-error-'));
      await cp(fixtureDir, standaloneDir, {
        filter: (src) => {
          return !src.includes('node_modules') && !src.includes('dist');
        },
        recursive: true,
      });
      execSync(`pnpm pack --pack-destination ${standaloneDir}`, {
        cwd: wakuDir,
        stdio: 'inherit',
      });
      const name = `waku-${version}.tgz`;
      execSync(`npm install --force ${join(standaloneDir, name)}`, {
        cwd: standaloneDir,
        stdio: 'inherit',
      });
    });

    test('access top page', async ({ page }) => {
      const [port, pid] = await run(isDev);
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByText('Home Page')).toBeVisible();
      await terminate(pid!);
    });

    test('access invalid page through client router', async ({ page }) => {
      const [port, pid] = await run(isDev);
      await page.goto(`http://localhost:${port}/`);
      await page.getByText('Invalid page').click();
      await expect(page.getByText('401')).toBeVisible();
      await terminate(pid!);
    });

    test('access invalid page directly', async ({ page }) => {
      const [port, pid] = await run(isDev);
      await page.goto(`http://localhost:${port}/invalid`);
      await expect(page.getByText('Unauthorized')).toBeVisible();
      await terminate(pid!);
    });
  });
}
