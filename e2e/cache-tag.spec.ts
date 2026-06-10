import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('cache-tag');

test.skip(
  ({ browserName }) => browserName !== 'chromium',
  'One browser is enough for this server-behavior test.',
);

test.describe('cache-tag', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('etag omits a cached element on the wire until invalidated', async ({
    page,
    browser,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('home-heading')).toBeVisible();

    // 1) First navigation to /cached: the element is sent over the wire.
    const firstRsc = page.waitForResponse('**/RSC/R/cached.txt**');
    await page.getByTestId('to-cached').click();
    const firstBody = await (await firstRsc).text();
    await expect(page.getByTestId('cached-content')).toHaveText(
      'cached render #1',
    );
    expect(firstBody).toContain('cached-content');

    // 1b) A fresh client (no etags) is served the element from the server
    //     cache: the render count stays at #1, proving the stored RSC payload
    //     was replayed rather than re-rendered.
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await freshPage.goto(`http://localhost:${port}/cached`);
    await waitForHydration(freshPage);
    await expect(freshPage.getByTestId('cached-content')).toHaveText(
      'cached render #1',
    );
    await freshContext.close();

    // 2) Navigate away and back: the etag still matches, so the element is
    //    omitted from the wire yet still rendered from the client's cache.
    await page.getByTestId('to-home').click();
    await expect(page.getByTestId('home-heading')).toBeVisible();
    const secondRsc = page.waitForResponse('**/RSC/R/cached.txt**');
    await page.getByTestId('to-cached').click();
    const secondBody = await (await secondRsc).text();
    await expect(page.getByTestId('cached-content')).toHaveText(
      'cached render #1',
    );
    expect(secondBody).not.toContain('cached-content');

    // 3) Invalidate the cache (bumps the etag), then navigate: the element is
    //    re-sent over the wire and re-rendered.
    await page.getByTestId('to-home').click();
    await expect(page.getByTestId('home-heading')).toBeVisible();
    const invalidation = await page.request.get(
      `http://localhost:${port}/invalidate`,
    );
    expect(invalidation.ok()).toBe(true);
    const thirdRsc = page.waitForResponse('**/RSC/R/cached.txt**');
    await page.getByTestId('to-cached').click();
    const thirdBody = await (await thirdRsc).text();
    await expect(page.getByTestId('cached-content')).toHaveText(
      'cached render #2',
    );
    expect(thirdBody).toContain('cached-content');
  });
});
