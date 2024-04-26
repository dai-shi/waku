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
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Browsers are not relevant for this test. One is enough.',
  );

  let cp: ChildProcess;
  let port: number;

  test.beforeAll('remove cache', async () => {
    await rm(`${cwd}/dist`, {
      recursive: true,
      force: true,
    });
    execSync(`node ${waku} build`, { cwd });
  });

  test.describe('static', () => {
    test.beforeEach(async () => {
      port = await getFreePort();
      // Use a static http server to make sure its not accidentally SSR.
      cp = exec(`pnpm serve -l ${port} dist/public`, { cwd });
      await waitPort({ port });
    });

    test('renders static content', async ({ page }) => {
      await page.goto(`http://localhost:${port}/server/static/static-echo`);
      expect(await page.getByTestId('echo').innerText()).toEqual('static-echo');
    });

    test('does not hydrate server components', async ({ page }) => {
      await page.goto(`http://localhost:${port}/server/static/static-echo`);
      const timestamp = await page.getByTestId('timestamp').innerText();
      await page.waitForTimeout(100);
      await page.reload();
      // Timestamp should remain the same, because its build time.
      expect(await page.getByTestId('timestamp').innerText()).toEqual(
        timestamp,
      );
      await page.waitForTimeout(100);
    });

    test('hydrates client components', async ({ page }) => {
      await page.goto(`http://localhost:${port}/client/static/static-echo`);
      expect(await page.getByTestId('echo').innerText()).toEqual('static-echo');
      const timestamp = await page.getByTestId('timestamp').innerText();
      await page.waitForTimeout(100);
      await page.reload();
      // Timestamp should update with each refresh, because its client rendered.
      expect(await page.getByTestId('timestamp').innerText()).not.toEqual(
        timestamp,
      );
      await page.waitForTimeout(100);
      // Timestamp should update in the browser because its hydrated.
      expect(await page.getByTestId('timestamp').innerText()).not.toEqual(
        timestamp,
      );
    });
  });

  test.describe('dynamic', () => {
    test.beforeEach(async () => {
      port = await getFreePort();
      cp = exec(`node ${waku} start --port ${port}`, { cwd });
      debugChildProcess(cp, fileURLToPath(import.meta.url), [
        /ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time/,
      ]);
      await waitPort({ port });
    });

    test('renders dynamic content', async ({ page }) => {
      await page.goto(`http://localhost:${port}/server/dynamic/dynamic-echo`);
      expect(await page.getByTestId('echo').innerText()).toEqual(
        'dynamic-echo',
      );
    });

    test('does not hydrate server components', async ({ page }) => {
      await page.goto(`http://localhost:${port}/server/dynamic/dynamic-echo`);
      const timestamp = await page.getByTestId('timestamp').innerText();
      await page.waitForTimeout(100);
      await page.reload();
      // Timestamp should update with each refresh, because its server rendered.
      expect(await page.getByTestId('timestamp').innerText()).not.toBe(
        timestamp,
      );
    });
    test('hydrates client components', async ({ page }) => {
      await page.goto(`http://localhost:${port}/client/dynamic/dynamic-echo`);
      expect(await page.getByTestId('echo').innerText()).toEqual(
        'dynamic-echo',
      );
      const timestamp = await page.getByTestId('timestamp').innerText();
      await page.waitForTimeout(100);
      await page.reload();
      // Timestamp should update with each refresh, because its server rendered.
      expect(await page.getByTestId('timestamp').innerText()).not.toEqual(
        timestamp,
      );
      await page.waitForTimeout(100);
      // Timestamp should update in the browser because its hydrated.
      expect(await page.getByTestId('timestamp').innerText()).not.toEqual(
        timestamp,
      );
    });
    // TODO: Add test case for cached RSC payload that should not re-render.
  });

  test.afterEach(async () => {
    await terminate(cp.pid!);
  });
});
