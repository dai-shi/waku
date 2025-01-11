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

    test('errors', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      await page.click("a[href='/error']");
      await expect(
        page.getByRole('heading', { name: 'Error Page' }),
      ).toBeVisible();
      await expect(page.getByTestId('fallback-render')).toHaveText(
        'Handling RSC render error',
      );
      await page.getByTestId('server-throws').getByTestId('throws').click();
      await expect(
        page.getByRole('heading', { name: 'Error Page' }),
      ).toBeVisible();
      await expect(
        page.getByTestId('server-throws').getByTestId('throws-error'),
      ).toHaveText('Something unexpected happened');
    });

    test('server function unreachable', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      await page.click("a[href='/error']");
      await expect(
        page.getByRole('heading', { name: 'Error Page' }),
      ).toBeVisible();
      await page.getByTestId('server-throws').getByTestId('success').click();
      await expect(
        page.getByTestId('server-throws').getByTestId('throws-success'),
      ).toHaveText('It worked');
      await page.getByTestId('server-throws').getByTestId('reset').click();
      await expect(
        page.getByTestId('server-throws').getByTestId('throws-success'),
      ).toHaveText('init');
      await stopApp();
      await page.getByTestId('server-throws').getByTestId('success').click();
      await expect(
        page.getByTestId('server-throws').getByTestId('throws-error'),
      ).toHaveText('Failed to fetch');
      ({ port, stopApp } = await startApp(mode));
    });

    test('server page unreachable', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      await stopApp();
      await page.click("a[href='/error']");
      // Default router client error boundary is reached
      await expect(
        page.getByRole('heading', { name: 'Failed to Fetch' }),
      ).toBeVisible();
      ({ port, stopApp } = await startApp(mode));
    });

    test('api hi.txt', async () => {
      const res = await fetch(`http://localhost:${port}/api/hi.txt`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('hello from a text file!');
    });

    test('api hi', async () => {
      const res = await fetch(`http://localhost:${port}/api/hi`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('hello world!');
    });

    test('api empty', async () => {
      const res = await fetch(`http://localhost:${port}/api/empty`);
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('');
    });

    test('api hi with POST', async () => {
      const res = await fetch(`http://localhost:${port}/api/hi`, {
        method: 'POST',
        body: 'from the test!',
      });
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('POST to hello world! from the test!');
    });
  });
}
