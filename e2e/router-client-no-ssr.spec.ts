import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('router-client-no-ssr');
const rscNotFoundLog =
  /Failed to load resource: the server responded with a status of 404 \(Not Found\)/;

test.describe('router-client-no-ssr', () => {
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

  test('renders a route from the fallback shell', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);

    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  });

  for (const [container, query] of [
    ['document', ''],
    ['document.body', '?__container=body'],
  ] as const) {
    test(`direct missing route renders Not Found fallback in ${container} without /404 page`, async ({
      page,
    }) => {
      const rscRequests: string[] = [];
      page.on('request', (request) => {
        if (request.url().includes('/RSC/R/missing.txt')) {
          rscRequests.push(request.url());
        }
      });
      const errors: string[] = [];
      page.on('pageerror', (error) => {
        errors.push(error.message);
      });
      page.on('console', (msg) => {
        if (msg.type() === 'error' && !rscNotFoundLog.test(msg.text())) {
          errors.push(msg.text());
        }
      });

      await page.goto(`http://localhost:${port}/missing${query}`);

      await expect(
        page.getByRole('heading', { name: 'Not Found' }),
      ).toBeVisible();
      await expect(page).toHaveURL(`http://localhost:${port}/missing${query}`);
      expect(rscRequests).toHaveLength(1);
      expect(errors).toEqual([]);
    });
  }
});
