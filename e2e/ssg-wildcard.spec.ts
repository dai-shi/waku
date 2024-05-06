import { debugChildProcess, getFreePort, terminate, test } from './utils.js';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp } from 'node:fs/promises';
import { exec, execSync } from 'node:child_process';
import { expect } from '@playwright/test';
import waitPort from 'wait-port';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

let standaloneDir: string;
const exampleDir = fileURLToPath(
  new URL('./fixtures/ssg-wildcard', import.meta.url),
);
const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));
const { version } = createRequire(import.meta.url)(
  join(wakuDir, 'package.json'),
);

test.describe('ssg wildcard', async () => {
  test.beforeEach(async () => {
    // GitHub Action on Windows doesn't support mkdtemp on global temp dir,
    // Which will cause files in `src` folder to be empty.
    // I don't know why
    const tmpDir = process.env.TEMP_DIR ? process.env.TEMP_DIR : tmpdir();
    standaloneDir = await mkdtemp(join(tmpDir, 'waku-ssg-wildcard-'));
    await cp(exampleDir, standaloneDir, {
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
    execSync(`npm install ${join(standaloneDir, name)}`, {
      cwd: standaloneDir,
      stdio: 'inherit',
    });
  });

  test(`works`, async ({ page }) => {
    execSync(
      `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} build`,
      {
        cwd: standaloneDir,
        stdio: 'inherit',
      },
    );
    const port = await getFreePort();
    const cp = exec(
      `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} start --port ${port}`,
      { cwd: standaloneDir },
    );
    debugChildProcess(cp, fileURLToPath(import.meta.url), [
      /ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time/,
    ]);

    await waitPort({ port });

    await page.goto(`http://localhost:${port}`);
    await expect(page.getByRole('heading', { name: '/' })).toBeVisible();

    await page.goto(`http://localhost:${port}/foo`);
    await expect(page.getByRole('heading', { name: '/foo' })).toBeVisible();

    await page.goto(`http://localhost:${port}/bar/baz`);
    await expect(page.getByRole('heading', { name: '/bar/baz' })).toBeVisible();

    await terminate(cp.pid!);
  });
});
