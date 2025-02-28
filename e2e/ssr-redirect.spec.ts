import { expect } from '@playwright/test';

import { test, prepareNormalSetup } from './utils.js';

const startApp = prepareNormalSetup('ssr-redirect');

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`ssr-redirect: ${mode}`, () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp(mode));
    });
    test.afterAll(async () => {
      await stopApp();
    });

    test('access sync page directly', async ({ page }) => {
      await page.goto(`http://localhost:${port}/sync`);
      await expect(page.getByRole('heading')).toHaveText('Destination Page');
    });

    test('access async page directly', async ({ page }) => {
      await page.goto(`http://localhost:${port}/async`);
      await expect(page.getByRole('heading')).toHaveText('Destination Page');
    });

    test('access sync page with client navigation', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByRole('heading')).toHaveText('Home Page');
      await page.click("a[href='/sync']");
      await expect(page.getByRole('heading')).toHaveText('Destination Page');
    });

    test('access async page with client navigation', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByRole('heading')).toHaveText('Home Page');
      await page.click("a[href='/async']");
      await expect(page.getByRole('heading')).toHaveText('Destination Page');
    });
  });
}
