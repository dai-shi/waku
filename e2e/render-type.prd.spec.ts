import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('render-type');

test.describe('render type', () => {
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
      await expect(page.getByTestId('echo')).toHaveText('static-echo');
      await expect(page.getByTestId('req-url')).toHaveText(/\/static-echo$/);

      // static page is evaluated only once
      const htmlTimestamp = await page.getByTestId('timestamp').innerText();
      await page.goto(`http://localhost:${port}`);
      await waitForHydration(page);
      await page.getByRole('link', { name: '/server/static' }).click();
      await expect(page.getByTestId('timestamp')).toHaveText(htmlTimestamp);
    });

    test('does not hydrate server components', async ({ page }) => {
      await page.goto(`http://localhost:${port}/server/static/static-echo`);
      const timestamp = await page.getByTestId('timestamp').innerText();
      await page.reload();
      // Timestamp should remain the same, because its build time.
      await expect(page.getByTestId('timestamp')).toHaveText(timestamp);
    });

    test('hydrates client components', async ({ page }) => {
      await page.goto(`http://localhost:${port}/client/static/static-echo`);
      await expect(page.getByTestId('echo')).toHaveText('static-echo');
      const timestamp = await page.getByTestId('timestamp').innerText();
      await page.reload();
      // Timestamp should update with each refresh, because its client rendered.
      await expect(page.getByTestId('timestamp')).not.toHaveText(timestamp);
      // Timestamp should update in the browser because its hydrated.
      await expect(page.getByTestId('timestamp')).not.toHaveText(timestamp);
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
      await expect(page.getByTestId('echo')).toHaveText('dynamic-echo');
      await expect(page.getByTestId('req-url')).toHaveText(/\/dynamic-echo$/);
    });

    test('does not hydrate server components', async ({ page }) => {
      await page.goto(`http://localhost:${port}/server/dynamic/dynamic-echo`);
      const timestamp = await page.getByTestId('timestamp').innerText();
      await page.reload();
      // Timestamp should update with each refresh, because its server rendered.
      await expect(page.getByTestId('timestamp')).not.toHaveText(timestamp);
    });

    test('hydrates client components', async ({ page }) => {
      await page.goto(`http://localhost:${port}/client/dynamic/dynamic-echo`);
      await expect(page.getByTestId('echo')).toHaveText('dynamic-echo');
      const timestamp = await page.getByTestId('timestamp').innerText();
      await page.reload();
      // Timestamp should update with each refresh, because its server rendered.
      await expect(page.getByTestId('timestamp')).not.toHaveText(timestamp);
      // Timestamp should update in the browser because its hydrated.
      await expect(page.getByTestId('timestamp')).not.toHaveText(timestamp);
    });

    test('unstable_phase', async ({ page }) => {
      await page.goto(`http://localhost:${port}/build/static`);
      await expect(page.getByTestId('phase')).toHaveText('true');
      await page.goto(`http://localhost:${port}/build/dynamic`);
      await expect(page.getByTestId('phase')).toHaveText('false');
    });

    // TODO: Add test case for cached RSC payload that should not re-render.
  });
});
