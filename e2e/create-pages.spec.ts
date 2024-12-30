import { expect } from '@playwright/test';

import { test, prepareStandaloneSetup } from './utils.js';

const startApp = prepareStandaloneSetup('create-pages');

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`create-pages: ${mode}`, () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp(mode));
    });
    test.afterAll(async () => {
      await stopApp();
    });

    test('home', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      const backgroundColor = await page.evaluate(() =>
        window
          .getComputedStyle(document.body)
          .getPropertyValue('background-color'),
      );
      expect(backgroundColor).toBe('rgb(254, 254, 254)');
    });

    test('foo', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      await page.click("a[href='/foo']");
      await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();

      await page.goto(`http://localhost:${port}/foo`);
      await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
    });

    test('nested/foo', async ({ page }) => {
      // /nested/foo is defined as a staticPath of /nested/[id] which matches this layout
      await page.goto(`http://localhost:${port}/nested/foo`);
      await expect(
        page.getByRole('heading', { name: 'Deeply Nested Layout' }),
      ).toBeVisible();
    });

    test('wild/hello/world', async ({ page }) => {
      await page.goto(`http://localhost:${port}/wild/hello/world`);
      await expect(
        page.getByRole('heading', { name: 'Slug: hello/world' }),
      ).toBeVisible();
    });

    test('nested/baz', async ({ page }) => {
      await page.goto(`http://localhost:${port}/nested/baz`);
      await expect(
        page.getByRole('heading', { name: 'Nested Layout' }),
      ).toBeVisible();
    });

    test('jump', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      await page.click("a[href='/foo']");
      await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
      await page.click('text=Jump to random page');
      await page.waitForTimeout(500); // need to wait not to error
      await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
    });
  });
}
