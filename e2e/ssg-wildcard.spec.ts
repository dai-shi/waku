import { expect } from '@playwright/test';

import { test, prepareStandaloneSetup } from './utils.js';

const startApp = prepareStandaloneSetup('ssg-wildcard');

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`ssg wildcard: ${mode}`, async () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp(mode));
    });
    test.afterAll(async () => {
      await stopApp();
    });

    test(`works`, async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      await expect(page.getByRole('heading', { name: '/' })).toBeVisible();

      await page.goto(`http://localhost:${port}/foo`);
      await expect(page.getByRole('heading', { name: '/foo' })).toBeVisible();

      await page.goto(`http://localhost:${port}/bar/baz`);
      await expect(
        page.getByRole('heading', { name: '/bar/baz' }),
      ).toBeVisible();
    });
  });
}
