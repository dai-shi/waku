import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('use-router');

test.describe('useRouter', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
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
      await expect(page.getByRole('heading', { name: 'Static' })).toBeVisible();
      await expect(page.getByTestId('path')).toHaveText('Path: /static');
    });

    test(`on dynamic pages with trailing slash`, async ({ page }) => {
      await page.goto(`http://localhost:${port}/dynamic/`);
      await expect(
        page.getByRole('heading', { name: 'Dynamic' }),
      ).toBeVisible();
      await expect(page.getByTestId('path')).toHaveText('Path: /dynamic');
    });

    test(`on static pages with trailing slash`, async ({ page }) => {
      await page.goto(`http://localhost:${port}/static/`);
      await expect(page.getByRole('heading', { name: 'Static' })).toBeVisible();
      await expect(page.getByTestId('path')).toHaveText('Path: /static');
    });
  });

  test.describe('updates path on link navigation', () => {
    test(`on dynamic pages`, async ({ page }) => {
      await page.goto(`http://localhost:${port}/dynamic`);
      await waitForHydration(page);
      await page.getByText('Go to static', { exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Static' })).toBeVisible();
      await expect(page.getByTestId('path')).toHaveText('Path: /static');
    });

    test(`on static pages`, async ({ page }) => {
      await page.goto(`http://localhost:${port}/static`);
      await waitForHydration(page);
      await page.locator('text=Go to dynamic').click();
      await expect(
        page.getByRole('heading', { name: 'Dynamic' }),
      ).toBeVisible();
      await expect(page.getByTestId('path')).toHaveText('Path: /dynamic');
    });

    test('router.push changes the page', async ({ page }) => {
      await page.goto(`http://localhost:${port}/dynamic`);
      await waitForHydration(page);
      await page.locator('text=Static router.push button').click();
      await expect(page.getByRole('heading', { name: 'Static' })).toBeVisible();
      await expect(page.getByTestId('path')).toHaveText('Path: /static');
    });

    test('router.replace changes page without pushing history', async ({
      page,
    }) => {
      await page.goto(`http://localhost:${port}/dynamic`);
      await waitForHydration(page);
      await page
        .getByRole('link', { name: 'Go to static', exact: true })
        .click();
      await expect(page.getByRole('heading', { name: 'Static' })).toBeVisible();
      const beforeReplaceHistoryLength = await page.evaluate(
        () => window.history.length,
      );

      await page.getByTestId('router-replace-dynamic').click();
      await expect(
        page.getByRole('heading', { name: 'Dynamic' }),
      ).toBeVisible();
      await expect(page.getByTestId('query')).toHaveText('Query: 9');
      await expect(page.getByTestId('hash')).toHaveText('Hash: 9');

      const afterReplaceHistoryLength = await page.evaluate(
        () => window.history.length,
      );
      expect(afterReplaceHistoryLength).toBe(beforeReplaceHistoryLength);

      await page.goBack();
      await expect(
        page.getByRole('heading', { name: 'Dynamic' }),
      ).toBeVisible();
      await expect(page.getByTestId('query')).toHaveText('Query: 0');
      await expect(page.getByTestId('hash')).toHaveText('Hash: 0');
    });

    test('router.back and router.forward restore route state', async ({
      page,
    }) => {
      await page.goto(`http://localhost:${port}/dynamic`);
      await waitForHydration(page);
      await page.getByText('Increment query', { exact: true }).click();
      await expect(page.getByTestId('query')).toHaveText('Query: 1');

      await page
        .getByRole('link', { name: 'Go to static', exact: true })
        .click();
      await expect(page.getByRole('heading', { name: 'Static' })).toBeVisible();
      await expect(page.getByTestId('query')).toHaveText('Query: 0');

      await page.getByTestId('router-back').click();
      await expect(
        page.getByRole('heading', { name: 'Dynamic' }),
      ).toBeVisible();
      await expect(page.getByTestId('query')).toHaveText('Query: 1');

      await page.getByTestId('router-forward').click();
      await expect(page.getByRole('heading', { name: 'Static' })).toBeVisible();
      await expect(page.getByTestId('query')).toHaveText('Query: 0');
    });

    test('router.reload refetches dynamic route', async ({ page }) => {
      await page.goto(`http://localhost:${port}/dynamic`);
      await waitForHydration(page);
      const beforeText =
        (await page.getByTestId('dynamic-render-count').textContent()) || '';
      const before = parseInt(beforeText.replace('Render count: ', ''), 10);

      await page.getByTestId('router-reload').click();

      await expect
        .poll(async () => {
          const afterText =
            (await page.getByTestId('dynamic-render-count').textContent()) ||
            '';
          const after = parseInt(afterText.replace('Render count: ', ''), 10);
          return Number.isNaN(after) ? -1 : after;
        })
        .toBeGreaterThan(before);
    });

    test('router.prefetch allows push to reuse prefetched route response', async ({
      page,
    }) => {
      const rscRequests: string[] = [];
      page.on('request', (request) => {
        const requestUrl = request.url();
        if (requestUrl.includes('/RSC/')) {
          rscRequests.push(requestUrl);
        }
      });

      await page.goto(`http://localhost:${port}/dynamic`);
      await waitForHydration(page);
      const beforePrefetch = rscRequests.length;

      await page.getByTestId('router-prefetch-static').click();
      await expect.poll(() => rscRequests.length).toBe(beforePrefetch + 1);
      const prefetchedCount = rscRequests.length;

      await page.getByTestId('router-push-prefetched-static').click();
      await expect(page.getByRole('heading', { name: 'Static' })).toBeVisible();
      await expect(page.getByTestId('query')).toHaveText('Query: 55');
      await expect(page.getByTestId('hash')).toHaveText('Hash: 55');
      expect(rscRequests).toHaveLength(prefetchedCount);
    });

    test('router.prefetch accepts a structured target and push reuses it', async ({
      page,
    }) => {
      const rscRequests: string[] = [];
      page.on('request', (request) => {
        const requestUrl = request.url();
        if (requestUrl.includes('/RSC/')) {
          rscRequests.push(requestUrl);
        }
      });

      await page.goto(`http://localhost:${port}/dynamic`);
      await waitForHydration(page);
      const beforePrefetch = rscRequests.length;

      await page.getByTestId('router-prefetch-structured').click();
      await expect.poll(() => rscRequests.length).toBe(beforePrefetch + 1);
      const prefetchedCount = rscRequests.length;

      await page.getByTestId('router-push-structured').click();
      await expect(page.getByRole('heading', { name: 'Static' })).toBeVisible();
      await expect(page.getByTestId('hash')).toHaveText('Hash: 77');
      expect(rscRequests).toHaveLength(prefetchedCount);
    });

    test('router.push last call wins during fast consecutive pushes', async ({
      page,
    }) => {
      const messages: string[] = [];
      page.on('console', (msg) => messages.push(msg.text()));
      await page.goto(`http://localhost:${port}/race`);
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      await waitForHydration(page);

      await page.getByRole('button', { name: 'Fast Navigate' }).click();

      await expect(page).toHaveURL(`http://localhost:${port}/race-bar`);
      await expect(page.getByRole('heading', { name: 'Home' })).toBeHidden();
      await expect(page.getByRole('heading', { name: 'Bar' })).toBeVisible();
      expect(messages.some((msg) => msg.includes('Uncaught'))).toBe(false);
    });

    test('router.push preserves trailing-slash URL while keeping canonical path', async ({
      page,
    }) => {
      await page.goto(`http://localhost:${port}/dynamic`);
      await waitForHydration(page);
      await page.getByTestId('router-push-static-trailing').click();
      await expect(page.getByRole('heading', { name: 'Static' })).toBeVisible();
      await expect(page).toHaveURL(`http://localhost:${port}/static/`);
      await expect(page.getByTestId('path')).toHaveText('Path: /static');
    });

    test('Link supports trailing-slash targets', async ({ page }) => {
      await page.goto(`http://localhost:${port}/dynamic`);
      await waitForHydration(page);
      await page.getByTestId('link-static-trailing').click();
      await expect(page.getByRole('heading', { name: 'Static' })).toBeVisible();
      await expect(page).toHaveURL(`http://localhost:${port}/static/`);
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
      await waitForHydration(page);
      await page.getByText('Increment query', { exact: true }).click();
      await expect(page.getByTestId('query')).toHaveText('Query: 1');
      await page.locator('text=Increment query (push)').click();
      await expect(page.getByTestId('query')).toHaveText('Query: 2');
    });

    test(`on static pages`, async ({ page }) => {
      await page.goto(`http://localhost:${port}/static`);
      await waitForHydration(page);
      await page.getByText('Increment query', { exact: true }).click();
      await expect(page.getByTestId('query')).toHaveText('Query: 1');
      await page.locator('text=Increment query (push)').click();
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
      await waitForHydration(page);
      await page.getByText('Increment hash', { exact: true }).click();
      await expect(page.getByTestId('hash')).toHaveText('Hash: 1');
      await page.locator('text=Increment hash (push)').click();
      await expect(page.getByTestId('hash')).toHaveText('Hash: 2');
    });

    test(`on static pages`, async ({ page }) => {
      await page.goto(`http://localhost:${port}/static`);
      await waitForHydration(page);
      await page.getByText('Increment hash', { exact: true }).click();
      await expect(page.getByTestId('hash')).toHaveText('Hash: 1');
      await page.locator('text=Increment hash (push)').click();
      await expect(page.getByTestId('hash')).toHaveText('Hash: 2');
    });
  });

  test.describe('calls route change event handlers', () => {
    test(`on dynamic pages`, async ({ page }) => {
      await page.goto(`http://localhost:${port}/dynamic`);
      const msgs: string[] = [];
      const prefix = '[router event] ';
      page.on('console', (msg) => {
        const text = msg.text();
        if (text.startsWith(prefix)) {
          msgs.push(text.slice(prefix.length));
        }
      });
      await waitForHydration(page);
      await page.locator('text=Static router.push button').click();
      await expect(page.getByRole('heading', { name: 'Static' })).toBeVisible();
      expect(msgs).toEqual(['Route change started', 'Route change completed']);
    });
  });
});
