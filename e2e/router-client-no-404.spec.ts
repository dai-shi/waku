import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('router-client-no-404');

test.describe('router-client-no-404', () => {
  let port: number;
  let stopApp: (() => Promise<void>) | undefined;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    if (stopApp) {
      await stopApp();
    }
  });

  test('direct not found renders the default fallback without /404 page', async ({
    page,
  }) => {
    const response = await page.goto(
      `http://localhost:${port}/trigger-not-found`,
    );

    expect(response?.status()).toBe(404);
    await expect(
      page.getByRole('heading', { name: 'Not Found' }),
    ).toBeVisible();
  });

  test('client navigation to missing route renders Not Found fallback without /404 page', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.getByTestId('go-missing').click();

    await expect(
      page.getByRole('heading', { name: 'Not Found' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Custom 404' })).toHaveCount(
      0,
    );
    await expect(page).toHaveURL(/\/missing$/);
  });

  test('client navigation to missing trailing-slash route renders Not Found fallback without /404 page', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.getByTestId('go-missing-trailing').click();

    await expect(
      page.getByRole('heading', { name: 'Not Found' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Custom 404' })).toHaveCount(
      0,
    );
    await expect(page).toHaveURL(/\/missing\/$/);
  });
});
