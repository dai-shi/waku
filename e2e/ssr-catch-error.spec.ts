import { expect } from '@playwright/test';

import { test, prepareStandaloneSetup } from './utils.js';

const startApp = prepareStandaloneSetup('ssr-catch-error');

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`ssr-catch-error: ${mode}`, () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp(mode));
    });
    test.afterAll(async () => {
      await stopApp();
    });

    test('access top page', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByText('Home Page')).toBeVisible();
      await expect(page.getByText('Something went wrong')).toBeVisible();
    });

    test('access dynamic server page', async ({ page }) => {
      await page.goto(`http://localhost:${port}/dynamic`);
      await expect(page.getByText('Home Page')).toBeVisible();
      await expect(page.getByText('Something went wrong')).toBeVisible();
    });

    test('access invalid page through client router', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await page.getByText('Invalid page').click();
      await expect(
        page.getByText('Unexpected error in client fallback'),
      ).toBeVisible();
    });

    test('access invalid page directly', async ({ page }) => {
      await page.goto(`http://localhost:${port}/invalid`);
      await expect(page.getByText('Unauthorized')).toBeVisible();
    });

    test('navigate back after invalid page through client router', async ({
      page,
    }) => {
      await page.goto(`http://localhost:${port}/`);
      await page.getByText('Invalid page').click();
      await expect(
        page.getByText('Unexpected error in client fallback'),
      ).toBeVisible();
      await page.goBack();
      await expect(page.getByText('Home Page')).toBeVisible();
    });
  });
}
