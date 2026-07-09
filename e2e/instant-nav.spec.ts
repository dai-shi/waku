import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

// Instant navigation (`<Link ... unstable_instant>`): on a revisited (cached)
// route, navigation paints the cached shell + the <Suspense> skeleton
// immediately, then streams the fresh dynamic parts in.
const startApp = prepareNormalSetup('instant-nav');

test.describe('instant-nav', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  // static layout + dynamic page: the page area is the hole.
  test('revisit paints the cached shell + skeleton, then streams the page', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/post/1`);
    await waitForHydration(page);
    await expect(page.getByTestId('post-body')).toHaveText('Post 1');

    await page.getByTestId('link-post-2').click();
    await expect(page.getByTestId('post-body')).toHaveText('Post 2');

    await page.getByTestId('link-post-1').click();
    await expect(page.getByTestId('page-skeleton')).toBeVisible();
    await expect(page.getByTestId('post-body')).toHaveText('Post 1');
    // the 'complete' route-change event fires for the navigated route.
    await expect(page.getByTestId('last-complete')).toHaveText('/post/1');
  });

  // An instant navigation to a never-visited route has no cached shell, so it
  // must NOT flash blank/skeleton: it holds the old page until the response.
  test('an uncached instant navigation holds the old page (no blank)', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/post/1`);
    await waitForHydration(page);
    await expect(page.getByTestId('post-body')).toHaveText('Post 1');

    // Delay the RSC so the in-flight window is observable.
    await page.route('**/RSC/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 500));
      await route.continue();
    });

    // /post/3 was never visited -> not cached -> the old page is held.
    await page.getByTestId('link-post-3').click();
    await expect(page.getByTestId('post-body')).toHaveText('Post 1');
    await expect(page.getByTestId('page-skeleton')).toBeHidden();
    await expect(page.getByTestId('post-body')).toHaveText('Post 3');
  });

  // static page + dynamic slice: only the slice is a hole, so the static page
  // content stays put and the skeleton is localized to the slice.
  test('revisit keeps static page content while the dynamic slice streams', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/widget`);
    await waitForHydration(page);
    await expect(page.getByTestId('clock-value')).toBeVisible();

    await page.getByTestId('link-post-1').click();
    await expect(page.getByTestId('post-body')).toHaveText('Post 1');

    await page.getByTestId('link-widget').click();
    await expect(page.getByTestId('widget-static')).toBeVisible();
    await expect(page.getByTestId('clock-skeleton')).toBeVisible();
    await expect(page.getByTestId('clock-value')).toBeVisible();
  });

  // A second instant navigation while the first is still fetching must win
  // (the first is aborted and never reconciles over the second).
  test('a second instant navigation supersedes an in-flight one', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/post/1`);
    await waitForHydration(page);
    await page.getByTestId('link-post-2').click();
    await expect(page.getByTestId('post-body')).toHaveText('Post 2');
    await page.getByTestId('link-post-1').click();
    await expect(page.getByTestId('post-body')).toHaveText('Post 1');

    // /post/1 and /post/2 are cached now; delay the RSC and fire both.
    await page.route('**/RSC/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 400));
      await route.continue();
    });
    await page.getByTestId('link-post-2').click();
    await page.getByTestId('link-post-1').click();
    await expect(page.getByTestId('post-body')).toHaveText('Post 1');
    await expect(page).toHaveURL(/\/post\/1$/);
  });

  // A view prefetch with mode 'once' warms the route's static parts, so even
  // the route's first visit paints the shell instantly.
  test('a prefetched route is instant on its first visit', async ({ page }) => {
    const slowRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('R/slow')) {
        slowRequests.push(request.url());
      }
    });
    await page.goto(`http://localhost:${port}/post/1`);
    await waitForHydration(page);
    // link-slow is in view, so its 'once' prefetch fires on load
    await expect.poll(() => slowRequests.length).toBe(1);
    // let the prefetched response expire (ttl: 300); the statics stay
    await page.waitForTimeout(500);

    await page.getByTestId('link-slow').click();
    // the shell paints before the slow response arrives
    await expect(page).toHaveURL(/\/slow$/);
    await expect(page.getByTestId('page-skeleton')).toBeVisible();
    await expect(page.getByTestId('slow-body')).toHaveText('Slow page');
  });

  test('mode once warms a route only once per session', async ({ page }) => {
    const slowRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('R/slow')) {
        slowRequests.push(request.url());
      }
    });
    await page.goto(`http://localhost:${port}/post/1`);
    await waitForHydration(page);
    await expect.poll(() => slowRequests.length).toBe(1);
    await page.waitForTimeout(500);

    // the navigation fetches fresh (the prefetched response expired)
    await page.getByTestId('link-slow').click();
    await expect(page.getByTestId('slow-body')).toHaveText('Slow page');
    expect(slowRequests.length).toBe(2);

    // back on a page with the link in view: 'once' does not warm again
    await page.getByTestId('link-post-1').click();
    await expect(page.getByTestId('post-body')).toHaveText('Post 1');
    await page.waitForTimeout(500);
    expect(slowRequests.length).toBe(2);
  });

  // Within the ttl, a navigation reuses the prefetched response and makes no
  // request of its own.
  test('a navigation within the ttl reuses the prefetch', async ({ page }) => {
    const hoverRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('R/hover')) {
        hoverRequests.push(request.url());
      }
    });
    await page.goto(`http://localhost:${port}/post/1`);
    await waitForHydration(page);

    await page.getByTestId('link-hover').hover();
    await expect.poll(() => hoverRequests.length).toBe(1);
    await page.getByTestId('link-hover').click();
    await expect(page.getByTestId('hover-body')).toHaveText('Hover page');
    expect(hoverRequests.length).toBe(1);
  });

  test('a prefetch after the ttl fetches again', async ({ page }) => {
    const hoverRequests: string[] = [];
    page.on('request', (request) => {
      if (request.url().includes('R/hover')) {
        hoverRequests.push(request.url());
      }
    });
    await page.goto(`http://localhost:${port}/post/1`);
    await waitForHydration(page);

    await page.getByTestId('link-hover').hover();
    await expect.poll(() => hoverRequests.length).toBe(1);

    // hovering again within the ttl is deduped
    await page.getByTestId('link-post-1').hover();
    await page.getByTestId('link-hover').hover();
    await page.waitForTimeout(100);
    expect(hoverRequests.length).toBe(1);

    // after the ttl (600), the same trigger fetches again
    await page.waitForTimeout(700);
    await page.getByTestId('link-post-1').hover();
    await page.getByTestId('link-hover').hover();
    await expect.poll(() => hoverRequests.length).toBe(2);
  });

  // The optimistic commit happens before the response, so it reconciles a
  // server redirect once the response lands.
  test('a redirected instant navigation reconciles to the target', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/gate`);
    await waitForHydration(page);
    await expect(page.getByTestId('gate')).toBeVisible();

    await page.getByTestId('link-post-1').click();
    await expect(page.getByTestId('post-body')).toHaveText('Post 1');
    await expect(page.getByTestId('complete-count')).toHaveText('1');

    // /gate is cached now; revisiting it makes the server redirect to /post/2.
    await page.getByTestId('link-gate').click();
    await expect(page).toHaveURL(/\/post\/2$/);
    await expect(page.getByTestId('post-body')).toHaveText('Post 2');
    // the optimistic /gate commit and the redirect each complete exactly once
    await expect(page.getByTestId('complete-count')).toHaveText('3');
    await page.waitForTimeout(500);
    await expect(page.getByTestId('complete-count')).toHaveText('3');
  });

  // ...and surfaces a fetch error instead of getting stuck on the skeleton.
  test('a failed instant navigation surfaces the error instead of sticking', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/post/1`);
    await waitForHydration(page);
    await expect(page.getByTestId('post-body')).toHaveText('Post 1');

    await page.getByTestId('link-post-2').click();
    await expect(page.getByTestId('post-body')).toHaveText('Post 2');

    // Fail the RSC fetch, then instant-revisit /post/1 (its shell is cached).
    await page.route('**/RSC/**', (route) => route.abort());
    await page.getByTestId('link-post-1').click();
    await expect(page.locator('body')).toContainText(/error/i);
    await expect(page.getByTestId('page-skeleton')).toBeHidden();
    // The optimistic commit already moved to the target URL, the same place a
    // non-instant navigation that errors lands, and the error shows there.
    await expect(page).toHaveURL(/\/post\/1$/);
  });

  // With a dynamic etag (unstable_getEtag), an instant revisit must not let a
  // stale cached etag skip a since-changed slot and show another route's body.
  test('instant revisit does not serve stale content with a dynamic etag', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/post/1`);
    await waitForHydration(page);
    await expect(page.getByTestId('post-body')).toHaveText('Post 1');

    await page.getByTestId('link-post-2').click();
    await expect(page.getByTestId('post-body')).toHaveText('Post 2');

    await page.getByTestId('link-post-1').click();
    await expect(page.getByTestId('post-body')).toHaveText('Post 1');

    await page.getByTestId('link-post-2').click();
    await expect(page.getByTestId('post-body')).toHaveText('Post 2');
  });
});
