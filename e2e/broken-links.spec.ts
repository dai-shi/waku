import { expect } from '@playwright/test';

import { test, prepareStandaloneSetup } from './utils.js';

const startApp = prepareStandaloneSetup('broken-links');

test.describe('broken-links: normal server', async () => {
  let port: number;
  let stopApp: () => Promise<void>;
  test.beforeAll(async () => {
    ({ port, stopApp } = await startApp('PRD'));
  });
  test.afterAll(async () => {
    await stopApp();
  });

  test.describe('server side navigation', () => {
    test('existing page', async ({ page }) => {
      // Go to an existing page
      await page.goto(`http://localhost:${port}/exists`);
      // The page renders its header
      await expect(page.getByRole('heading')).toHaveText('Existing page');
      // The page URL is correct
      expect(page.url()).toBe(`http://localhost:${port}/exists`);
      // Go back to the index page
      await page.getByRole('link', { name: 'Back' }).click();
      await expect(page.getByRole('heading')).toHaveText('Index');
    });

    test('missing page', async ({ page }) => {
      // Navigate to a non-existing page
      await page.goto(`http://localhost:${port}/broken`);
      // The page renders the custom 404.tsx
      await expect(page.getByRole('heading')).toHaveText('Custom not found');
      // The browsers URL remains the one that was navigated to
      expect(page.url()).toBe(`http://localhost:${port}/broken`);
      // Go back to the index page
      await page.getByRole('link', { name: 'Back' }).click();
      await expect(page.getByRole('heading')).toHaveText('Index');
    });

    test('redirect', async ({ page }) => {
      // Navigate to a page that redirects to an existing page
      await page.goto(`http://localhost:${port}/redirect`);
      // The page renders the target page
      await expect(page.getByRole('heading')).toHaveText('Existing page');
      // The browsers URL is the one of the target page
      expect(page.url()).toBe(`http://localhost:${port}/exists`);
      // Go back to the index page
      await page.getByRole('link', { name: 'Back' }).click();
      await expect(page.getByRole('heading')).toHaveText('Index');
    });

    test('broken redirect', async ({ page }) => {
      // Navigate to a page that redirects to a non-existing page
      await page.goto(`http://localhost:${port}/broken-redirect`);
      // The page renders the custom 404.tsx
      await expect(page.getByRole('heading')).toHaveText('Custom not found');
      // The browsers URL remains the one that was redirected to
      expect(page.url()).toBe(`http://localhost:${port}/broken`);
      // Go back to the index page
      await page.getByRole('link', { name: 'Back' }).click();
      await expect(page.getByRole('heading')).toHaveText('Index');
    });
  });
});

test.describe('broken-links: static server', () => {
  let port: number;
  let stopApp: () => Promise<void>;
  test.beforeAll(async () => {
    ({ port, stopApp } = await startApp('STATIC'));
  });
  test.afterAll(async () => {
    await stopApp();
  });

  test.describe('client side navigation', () => {
    test('correct link', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      // Click on a link to an existing page
      await page.getByRole('link', { name: 'Existing page' }).click();
      // The page renders the target page
      await expect(page.getByRole('heading')).toHaveText('Existing page');
      // The browsers URL is the one of the target page
      expect(page.url()).toBe(`http://localhost:${port}/exists`);
      // Go back to the index page
      await page.getByRole('link', { name: 'Back' }).click();
      await expect(page.getByRole('heading')).toHaveText('Index');
    });

    test('broken link', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      // Click on a link to a non-existing page
      await page.getByRole('link', { name: 'Broken link' }).click();
      // The page renders the custom 404.tsx
      await expect(page.getByRole('heading')).toHaveText('Custom not found');
      // The browsers URL remains the one that was navigated to
      expect(page.url()).toBe(`http://localhost:${port}/broken`);
      // Go back to the index page
      await page.getByRole('link', { name: 'Back' }).click();
      await expect(page.getByRole('heading')).toHaveText('Index');
    });

    test('redirect', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      // Click on a link to a redirect
      await page.getByRole('link', { name: 'Correct redirect' }).click();
      // The page renders the target page
      await expect(page.getByRole('heading')).toHaveText('Existing page');
      // The browsers URL is the one of the target page
      expect(page.url()).toBe(`http://localhost:${port}/exists`);
      // Go back to the index page
      await page.getByRole('link', { name: 'Back' }).click();
      await expect(page.getByRole('heading')).toHaveText('Index');
    });

    test('broken redirect', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      // Click on a link to a broken redirect
      await page.getByRole('link', { name: 'Broken redirect' }).click();
      // The page renders the custom 404.tsx
      await expect(page.getByRole('heading')).toHaveText('Custom not found');
      // The browsers URL remains the link href
      // NOTE: This is inconsistent with server side navigation, but
      //       there is no way to tell where the RSC request was redirected
      //       to before failing with 404.
      expect(page.url()).toBe(`http://localhost:${port}/broken-redirect`);
      // Go back to the index page
      await page.getByRole('link', { name: 'Back' }).click();
      await expect(page.getByRole('heading')).toHaveText('Index');
    });
  });
});

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`broken-links/dynamic-not-found: ${mode}`, async () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp(mode));
    });
    test.afterAll(async () => {
      await stopApp();
    });

    test('access sync page directly', async ({ page }) => {
      await page.goto(`http://localhost:${port}/dynamic-not-found/sync`);
      await expect(page.getByRole('heading')).toHaveText('Custom not found');
    });

    test('access async page directly', async ({ page }) => {
      await page.goto(`http://localhost:${port}/dynamic-not-found/async`);
      await expect(page.getByRole('heading')).toHaveText('Custom not found');
    });

    test('access sync page with client navigation', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByRole('heading')).toHaveText('Index');
      await page.click("a[href='/dynamic-not-found/sync']");
      await expect(page.getByRole('heading')).toHaveText('Custom not found');
    });

    test('access async page with client navigation', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByRole('heading')).toHaveText('Index');
      await page.click("a[href='/dynamic-not-found/async']");
      await expect(page.getByRole('heading')).toHaveText('Custom not found');
    });
  });
}
