import { expect } from '@playwright/test';

import { test, prepareStandaloneSetup } from './utils.js';

const startApp = prepareStandaloneSetup('use-router');

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`useRouter: ${mode}`, async () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp(mode));
    });
    test.afterAll(async () => {
      await stopApp();
    });

    test.describe('returns the current path', () => {
      test(`on dynamic pages`, async ({ page }) => {
        await page.goto(`http://localhost:${port}/dynamic`);
        await expect(
          page.getByRole('heading', { name: 'Dynamic' }),
        ).toBeVisible();
        await expect(page.getByTestId('path')).toHaveText('Path: /dynamic');
      });

      test(`on static pages`, async ({ page }) => {
        await page.goto(`http://localhost:${port}/static`);
        await expect(
          page.getByRole('heading', { name: 'Static' }),
        ).toBeVisible();
        await expect(page.getByTestId('path')).toHaveText('Path: /static');
      });
    });

    test.describe('updates path on link navigation', () => {
      test(`on dynamic pages`, async ({ page }) => {
        await page.goto(`http://localhost:${port}/dynamic`);
        await page.click('text=Go to static');
        await expect(
          page.getByRole('heading', { name: 'Static' }),
        ).toBeVisible();
        await expect(page.getByTestId('path')).toHaveText('Path: /static');
      });

      test(`on static pages`, async ({ page }) => {
        await page.goto(`http://localhost:${port}/static`);
        await page.click('text=Go to dynamic');
        await expect(
          page.getByRole('heading', { name: 'Dynamic' }),
        ).toBeVisible();
        await expect(page.getByTestId('path')).toHaveText('Path: /dynamic');
      });

      test('router.push changes the page', async ({ page }) => {
        await page.goto(`http://localhost:${port}/dynamic`);
        await page.click('text=Static router.push button');
        await expect(
          page.getByRole('heading', { name: 'Static' }),
        ).toBeVisible();
        await expect(page.getByTestId('path')).toHaveText('Path: /static');
      });
    });

    test.describe('retrieves query variables', () => {
      test(`on dynamic pages`, async ({ page }) => {
        await page.goto(`http://localhost:${port}/dynamic?count=42`);
        await expect(page.getByTestId('query')).toHaveText('Query: 42');
      });

      test(`on static pages`, async ({ page }) => {
        await page.goto(`http://localhost:${port}/static?count=42`);
        await expect(page.getByTestId('query')).toHaveText('Query: 42');
      });
    });

    test.describe('updates query variables', () => {
      test(`on dynamic pages`, async ({ page }) => {
        await page.goto(`http://localhost:${port}/dynamic`);
        await page.click('text=Increment query');
        await expect(page.getByTestId('query')).toHaveText('Query: 1');
        await page.click('text=Increment query (push)');
        await expect(page.getByTestId('query')).toHaveText('Query: 2');
      });

      test(`on static pages`, async ({ page }) => {
        await page.goto(`http://localhost:${port}/static`);
        await page.click('text=Increment query');
        await expect(page.getByTestId('query')).toHaveText('Query: 1');
        await page.click('text=Increment query (push)');
        await expect(page.getByTestId('query')).toHaveText('Query: 2');
      });
    });

    test.describe('retrieves hashes', () => {
      test(`on dynamic pages`, async ({ page }) => {
        await page.goto(`http://localhost:${port}/dynamic#42`);
        await expect(page.getByTestId('hash')).toHaveText('Hash: 42');
      });

      test(`on static pages`, async ({ page }) => {
        await page.goto(`http://localhost:${port}/static#42`);
        await expect(page.getByTestId('hash')).toHaveText('Hash: 42');
      });
    });

    test.describe('updates hashes', () => {
      test(`on dynamic pages`, async ({ page }) => {
        await page.goto(`http://localhost:${port}/dynamic`);
        await page.click('text=Increment hash');
        await expect(page.getByTestId('hash')).toHaveText('Hash: 1');
        await page.click('text=Increment hash (push)');
        await expect(page.getByTestId('hash')).toHaveText('Hash: 2');
      });

      test(`on static pages`, async ({ page }) => {
        await page.goto(`http://localhost:${port}/static`);
        await page.click('text=Increment hash');
        await expect(page.getByTestId('hash')).toHaveText('Hash: 1');
        await page.click('text=Increment hash (push)');
        await expect(page.getByTestId('hash')).toHaveText('Hash: 2');
      });
    });
  });
}
