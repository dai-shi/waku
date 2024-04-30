import { expect } from '@playwright/test';
import { execSync, exec, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import waitPort from 'wait-port';
import { debugChildProcess, getFreePort, terminate, test } from './utils.js';
import { rm } from 'node:fs/promises';

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

const cwd = fileURLToPath(
  new URL('./fixtures/ssg-performance', import.meta.url),
);

test.describe(`high volume static site generation`, () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Browsers are not relevant for this test. One is enough.',
  );

  let cp: ChildProcess;
  let port: number;

  test.afterAll(async () => {
    await terminate(cp.pid!);
  });

  test('build and verify', async ({ page }) => {
    test.setTimeout(60000);
    await rm(`${cwd}/dist`, {
      recursive: true,
      force: true,
    });
    execSync(`node ${waku} build`, { cwd });
    port = await getFreePort();
    cp = exec(`node ${waku} start --port ${port}`, { cwd });
    debugChildProcess(cp, fileURLToPath(import.meta.url), [
      /ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time/,
    ]);
    await waitPort({ port });
    await page.goto(`http://localhost:${port}/path-3`);
    await expect(page.getByRole('heading')).toHaveText('/path-3');
  });
});
