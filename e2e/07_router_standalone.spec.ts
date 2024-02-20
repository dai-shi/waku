import { debugChildProcess, getFreePort, terminate, test } from './utils.js';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { exec, execSync } from 'node:child_process';
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import waitPort from 'wait-port';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const testMatrix = [{ withSSR: false }, { withSSR: true }] as const;

let standaloneDir: string;
const exampleDir = fileURLToPath(
  new URL('../examples/07_router', import.meta.url),
);
const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));

async function testRouterExample(page: Page, port: number) {
  await waitPort({
    port,
  });

  await page.goto(`http://localhost:${port}`);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

  await page.click("a[href='/foo']");

  await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();

  await page.goto(`http://localhost:${port}/foo`);
  await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();

  const backgroundColor = await page.evaluate(() =>
    window.getComputedStyle(document.body).getPropertyValue('background-color'),
  );
  expect(backgroundColor).toBe('rgb(254, 254, 254)');
}

test.describe('07_router standalone', () => {
  test.beforeAll('copy code', async () => {
    // GitHub Action on Windows doesn't support mkdtemp on global temp dir,
    // Which will cause files in `src` folder to be empty.
    // I don't know why
    const tmpDir = process.env.TEMP_DIR ? process.env.TEMP_DIR : tmpdir();
    standaloneDir = await mkdtemp(join(tmpDir, 'waku-07-router-'));
    await cp(exampleDir, standaloneDir, {
      filter: (src) => {
        return !src.includes('node_modules') && !src.includes('dist');
      },
      recursive: true,
    });
    execSync('npm install', {
      cwd: standaloneDir,
      stdio: 'inherit',
    });
    await rm(`${standaloneDir}/node_modules/waku`, {
      recursive: true,
      force: true,
    });
    // copy waku
    await cp(wakuDir, `${standaloneDir}/node_modules/waku`, {
      recursive: true,
    });
  });

  testMatrix.forEach(({ withSSR }) => {
    test(`should prod work ${withSSR ? 'with SSR' : ''}`, async ({ page }) => {
      test.fixme(withSSR, 'SSR is not working in standalone');
      execSync(
        `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} build${withSSR ? ' --with-ssr' : ''}`,
        {
          cwd: standaloneDir,
          stdio: 'inherit',
        },
      );
      const port = await getFreePort();
      const cp = exec(
        `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} start${withSSR ? ' --with-ssr' : ''}`,
        {
          cwd: standaloneDir,
          env: {
            ...process.env,
            PORT: `${port}`,
          },
        },
      );
      debugChildProcess(cp, fileURLToPath(import.meta.url));
      await testRouterExample(page, port);
      await terminate(cp.pid!);
    });

    test(`should dev work ${withSSR ? 'with SSR' : ''}`, async ({ page }) => {
      test.fixme(withSSR, 'SSR is not working in standalone');
      const port = await getFreePort();
      const cp = exec(
        `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} dev${withSSR ? ' --with-ssr' : ''}`,
        {
          cwd: standaloneDir,
          env: {
            ...process.env,
            PORT: `${port}`,
          },
        },
      );
      debugChildProcess(cp, fileURLToPath(import.meta.url));
      await testRouterExample(page, port);
      await terminate(cp.pid!);
    });
  });
});
