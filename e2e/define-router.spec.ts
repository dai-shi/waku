import { expect } from '@playwright/test';

import { test, prepareNormalSetup } from './utils.js';

const startApp = prepareNormalSetup('define-router');

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`define-router: ${mode}`, () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp(mode));
    });
    test.afterAll(async () => {
      await stopApp();
    });

    test('home', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('home-title')).toHaveText('Home');
      await page.getByText('Foo').click();
      await expect(page.getByTestId('foo-title')).toHaveText('Foo');
    });

    test('foo', async ({ page }) => {
      await page.goto(`http://localhost:${port}/foo`);
      await expect(page.getByTestId('foo-title')).toHaveText('Foo');
    });

    test('api hi', async ({ page }) => {
      await page.goto(`http://localhost:${port}/api/hi`);
      await expect(page.getByText('hello world!')).toBeVisible();
    });

    test('api hi.txt', async ({ page }) => {
      await page.goto(`http://localhost:${port}/api/hi.txt`);
      await expect(page.getByText('hello from a text file!')).toBeVisible();
    });

    test('api empty', async ({ page }) => {
      await page.goto(`http://localhost:${port}/api/empty`);
      await expect(await page.innerHTML('body')).toBe('');
    });

    test('not found', async ({ page }) => {
      await page.goto(`http://localhost:${port}/does-not-exist.txt`);
      await expect(page.getByText('Not Found')).toBeVisible();
    });
  });
}
