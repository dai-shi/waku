import { execSync, exec, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import waitPort from 'wait-port';
import { debugChildProcess, getFreePort, terminate, test } from './utils.js';
import { rm } from 'node:fs/promises';
import { expect } from '@playwright/test';

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

const cwd = fileURLToPath(new URL('./fixtures/render-type', import.meta.url));

test.describe(`render type`, () => {
  let cp: ChildProcess;
  let port: number;
  test.beforeAll('remove cache', async () => {
    await rm(`${cwd}/dist`, {
      recursive: true,
      force: true,
    });
  });

  test.beforeAll(async () => {
    execSync(`node ${waku} build`, { cwd });
  });

  test('dynamic page', async ({ browser }) => {
    port = await getFreePort();
    cp = exec(`node ${waku} start --port ${port}`, { cwd });
    debugChildProcess(cp, fileURLToPath(import.meta.url), [
      /ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time/,
    ]);
    await waitPort({ port });

    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/dynamic/dynamic-page`);
    await expect(
      page.getByRole('heading', { name: 'dynamic-page' }),
    ).toBeVisible();
  });

  test('static page', async ({ browser }) => {
    port = await getFreePort();
    // Use a static http server to verify the static page exists.
    cp = exec(`pnpm serve -l ${port} dist/public`, { cwd });
    await waitPort({ port });

    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/static/static-page`);
    await expect(
      page.getByRole('heading', { name: 'static-page' }),
    ).toBeVisible();
  });

  test.afterAll(async () => {
    await terminate(cp.pid!);
  });
});
