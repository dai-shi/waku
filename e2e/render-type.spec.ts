import { expect } from '@playwright/test';

import { test, prepareNormalSetup } from './utils.js';

const startApp = prepareNormalSetup('render-type');

test.describe('render type', () => {
  test.skip(
    ({ browserName }) => browserName !== 'chromium',
    'Browsers are not relevant for this test. One is enough.',
  );

  test.describe('static', () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp('STATIC'));
    });
    test.afterAll(async () => {
      await stopApp();
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
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp('PRD'));
    });
    test.afterAll(async () => {
      await stopApp();
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
});
