import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('spa-example');

test.describe('spa example coverage', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('renders client-only root from default HTML', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('title')).toHaveText('Hello Client');
    await expect(page.getByTestId('count')).toHaveText('Count: 0');
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByTestId('count')).toHaveText('Count: 1');
  });

  test('calls a server function imported only from client code', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.getByRole('button', { name: 'Greet' }).click();
    await expect(page.getByTestId('greeting')).toHaveText(
      'Hello Waku from the server',
    );
  });

  test('runs custom bootstrap code in request-time fallback HTML', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/bootstrap`);
    await expect(page.getByTestId('title')).toHaveText('Hello Client');
    expect(await page.evaluate(() => sessionStorage.getItem('bootstrap'))).toBe(
      'request',
    );
  });

  test(
    'runs custom bootstrap code in generated fallback HTML',
    { tag: '@prd' },
    async ({ page }) => {
      await page.goto(`http://localhost:${port}/bootstrap.html`);
      await expect(page.getByTestId('title')).toHaveText('Hello Client');
      expect(
        await page.evaluate(() => sessionStorage.getItem('bootstrap')),
      ).toBe('build');
    },
  );
});
