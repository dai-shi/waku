import { expect } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';
import {
  prepareNormalSetup,
  test,
  waitForHydration,
  waitForSelectorText,
} from './utils.js';

const startApp = prepareNormalSetup('router-client');
const allowedConsoleErrorPatterns: RegExp[] = [
  /An error occurred in the Server Components render\./,
  /Error:\s+Not Found/,
  /Error:\s+Redirect/,
  /Failed to load resource: the server responded with a status of 404 \(Not Found\)/,
  /Error: 404 Not Found/,
];
const isAllowedConsoleError = (text: string) =>
  allowedConsoleErrorPatterns.some((pattern) => pattern.test(text));

const installScrollToRecorder = async (page: Page) => {
  await page.evaluate(() => {
    const scrollToCalls: ScrollToOptions[] = [];
    (window as unknown as Record<string, unknown>).__scrollToCalls =
      scrollToCalls;
    const originalScrollTo = window.scrollTo.bind(window);
    window.scrollTo = ((options: ScrollToOptions | number, top?: number) => {
      if (typeof options === 'number') {
        scrollToCalls.push({ left: options, top: top ?? 0 });
        originalScrollTo(options, top ?? 0);
        return;
      }
      scrollToCalls.push(options);
      originalScrollTo(options);
    }) as typeof window.scrollTo;
  });
};

const resetScrollToCalls = async (page: Page) => {
  await page.evaluate(() => {
    const calls = (window as unknown as Record<string, unknown>)
      .__scrollToCalls as ScrollToOptions[] | undefined;
    if (calls) {
      calls.length = 0;
    }
  });
};

const getScrollToCalls = async (page: Page) =>
  (await page.evaluate(
    () =>
      (window as unknown as Record<string, unknown>)
        .__scrollToCalls as ScrollToOptions[],
  )) as ScrollToOptions[];

test.describe('router-client', () => {
  let port: number;
  let stopApp: () => Promise<void>;
  let consoleErrors: string[];
  let consoleHandler: ((msg: ConsoleMessage) => void) | undefined;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.beforeEach(async ({ page }) => {
    consoleErrors = [];
    consoleHandler = (msg: ConsoleMessage) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    };
    page.on('console', consoleHandler);
  });

  test.afterEach(async ({ page }) => {
    if (consoleHandler) {
      page.off('console', consoleHandler);
    }
    const unexpectedErrors = consoleErrors.filter(
      (text) => !isAllowedConsoleError(text),
    );
    expect(unexpectedErrors).toEqual([]);
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('popstate interceptor can block navigation', async ({ page }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/start');
    await expect(page.getByTestId('route-query')).toHaveText('');

    await page.evaluate(() => {
      window.history.pushState({}, '', '/ignored?__interceptor=block');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/start');
    await expect(page.getByTestId('route-query')).toHaveText('');
  });

  test('popstate interceptor can rewrite navigation target', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/start');
    await expect(page.getByTestId('route-query')).toHaveText('');

    await page.evaluate(() => {
      window.history.pushState({}, '', '/ignored?__interceptor=rewrite');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });

    await waitForSelectorText(
      page,
      '[data-testid="route-path"]',
      '/intercepted',
    );
    await waitForSelectorText(
      page,
      '[data-testid="route-query"]',
      'from=interceptor',
    );
    await waitForSelectorText(page, 'h1', 'Intercepted');
  });

  test('hash-only link navigation scrolls to anchor target', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);
    await installScrollToRecorder(page);

    await page.getByTestId('router-push-hash-target').click();

    await expect(page.getByTestId('route-path')).toHaveText('/start');
    await expect(page.getByTestId('route-query')).toHaveText('');
    await expect(page.getByTestId('route-hash')).toHaveText('#scroll-target');
    await expect(page).toHaveURL(/\/start#scroll-target$/);
    const scrollToCalls = await getScrollToCalls(page);
    const lastScrollToCall = scrollToCalls.at(-1);
    expect(lastScrollToCall).toBeDefined();
    expect(lastScrollToCall?.left).toBe(0);
    expect(lastScrollToCall?.top).toBeGreaterThan(100);
  });

  test('hash-only navigation preserves scroll when hash target is missing', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.evaluate(() => {
      window.scrollTo({ left: 0, top: 600 });
    });
    await installScrollToRecorder(page);

    await page.getByTestId('router-push-hash-missing').click();

    await expect(page.getByTestId('route-path')).toHaveText('/start');
    await expect(page.getByTestId('route-query')).toHaveText('');
    await expect(page.getByTestId('route-hash')).toHaveText('#missing');
    await expect(page).toHaveURL(/\/start#missing$/);
    expect(await getScrollToCalls(page)).toHaveLength(0);
  });

  test('query-only link navigation preserves current scroll position by default', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.evaluate(() => {
      window.scrollTo({ left: 0, top: 600 });
    });
    await installScrollToRecorder(page);

    await page.getByTestId('router-push-query-only').click();

    await expect(page.getByTestId('route-path')).toHaveText('/start');
    await expect(page.getByTestId('route-query')).toHaveText('from=query-only');
    await expect(page.getByTestId('route-hash')).toHaveText('');
    await expect(page).toHaveURL(/\/start\?from=query-only$/);
    const scrollToCalls = await getScrollToCalls(page);
    expect(scrollToCalls).toHaveLength(0);
  });

  test('same-route trailing-slash navigation preserves scroll and keeps canonical route path', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.evaluate(() => {
      window.scrollTo({ left: 0, top: 600 });
    });
    await installScrollToRecorder(page);

    await page.getByTestId('router-push-trailing-slash').click();

    await expect(page.getByTestId('route-path')).toHaveText('/start');
    await expect(page.getByTestId('route-query')).toHaveText('');
    await expect(page.getByTestId('route-hash')).toHaveText('');
    await expect(page).toHaveURL(/\/start\/$/);
    expect(await getScrollToCalls(page)).toHaveLength(0);
  });

  test('path-change link navigation resets scroll position to top by default', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.evaluate(() => {
      window.scrollTo({ left: 0, top: 600 });
    });
    await installScrollToRecorder(page);

    await page.getByTestId('router-push-next').click();

    await expect(page.getByRole('heading', { name: 'Next' })).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/next');
    await expect(page.getByTestId('route-query')).toHaveText('x=1');
    await expect(page.getByTestId('route-hash')).toHaveText('');
    await expect(page).toHaveURL(/\/next\?x=1$/);
    const scrollToCalls = await getScrollToCalls(page);
    const lastScrollToCall = scrollToCalls.at(-1);
    expect(lastScrollToCall).toBeDefined();
    expect(lastScrollToCall?.left).toBe(0);
    expect(lastScrollToCall?.top).toBe(0);
  });

  test('back/forward for query-only history preserves scroll behavior', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.evaluate(() => {
      window.scrollTo({ left: 0, top: 600 });
    });
    await installScrollToRecorder(page);

    await page.getByTestId('router-push-query-only').click();
    await expect(page.getByTestId('route-path')).toHaveText('/start');
    await expect(page.getByTestId('route-query')).toHaveText('from=query-only');
    expect(await getScrollToCalls(page)).toHaveLength(0);

    await page.evaluate(() => {
      window.history.back();
    });
    await expect(page.getByTestId('route-path')).toHaveText('/start');
    await expect(page.getByTestId('route-query')).toHaveText('');
    expect(await getScrollToCalls(page)).toHaveLength(0);

    await page.evaluate(() => {
      window.history.forward();
    });
    await expect(page.getByTestId('route-path')).toHaveText('/start');
    await expect(page.getByTestId('route-query')).toHaveText('from=query-only');
    expect(await getScrollToCalls(page)).toHaveLength(0);
  });

  test('back/forward for path-change history scrolls to top', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.evaluate(() => {
      window.scrollTo({ left: 0, top: 600 });
    });
    await installScrollToRecorder(page);

    await page.getByTestId('router-push-next').click();
    await expect(page.getByRole('heading', { name: 'Next' })).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/next');
    let scrollToCalls = await getScrollToCalls(page);
    let lastScrollToCall = scrollToCalls.at(-1);
    expect(lastScrollToCall).toBeDefined();
    expect(lastScrollToCall?.top).toBe(0);

    await resetScrollToCalls(page);
    await page.evaluate(() => {
      window.history.back();
    });
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/start');
    scrollToCalls = await getScrollToCalls(page);
    lastScrollToCall = scrollToCalls.at(-1);
    expect(lastScrollToCall).toBeDefined();
    expect(lastScrollToCall?.top).toBe(0);

    await resetScrollToCalls(page);
    await page.evaluate(() => {
      window.history.forward();
    });
    await expect(page.getByRole('heading', { name: 'Next' })).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/next');
    scrollToCalls = await getScrollToCalls(page);
    lastScrollToCall = scrollToCalls.at(-1);
    expect(lastScrollToCall).toBeDefined();
    expect(lastScrollToCall?.top).toBe(0);
  });

  test('forward to hash history entry scrolls to anchor target', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);
    await installScrollToRecorder(page);

    await page.getByTestId('router-push-hash-target').click();
    await expect(page.getByTestId('route-hash')).toHaveText('#scroll-target');

    await resetScrollToCalls(page);
    await page.evaluate(() => {
      window.history.back();
    });
    await expect(page.getByTestId('route-hash')).toHaveText('');

    await resetScrollToCalls(page);
    await page.evaluate(() => {
      window.history.forward();
    });
    await expect(page.getByTestId('route-hash')).toHaveText('#scroll-target');
    const scrollToCalls = await getScrollToCalls(page);
    const lastScrollToCall = scrollToCalls.at(-1);
    expect(lastScrollToCall).toBeDefined();
    expect(lastScrollToCall?.left).toBe(0);
    expect(lastScrollToCall?.top).toBeGreaterThan(100);
  });

  test('route fetch includes X-Waku-Router-Skip header', async ({ page }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    const nextRscRequestPromise = page.waitForRequest(
      (request) =>
        request.url().includes('/RSC/R/next.txt') && request.method() === 'GET',
    );
    await page.getByTestId('go-next').click();
    const request = await nextRscRequestPromise;

    const skipHeader = request.headers()['x-waku-router-skip'];
    expect(skipHeader).toBeTruthy();
    const skipped = JSON.parse(skipHeader as string) as Record<string, string>;
    expect(Array.isArray(skipped)).toBe(false);
    expect(Object.keys(skipped).length).toBeGreaterThan(0);

    await expect(page.getByRole('heading', { name: 'Next' })).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/next');
    await expect(page.getByTestId('route-query')).toHaveText('x=1');
  });

  test('skip header omits static layout payload on soft navigation', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/skip/a`);
    await waitForHydration(page);

    await expect(page.getByTestId('skip-static-layout-marker')).toHaveText(
      'SKIP_STATIC_LAYOUT_MARKER',
    );
    await expect(
      page.getByRole('heading', { name: 'SKIP_A_PAGE_MARKER' }),
    ).toBeVisible();

    const rscResponsePromise = page.waitForResponse(
      (response) =>
        response.url().includes('/RSC/R/skip/b.txt') &&
        response.request().method() === 'GET',
    );

    await page.getByTestId('skip-go-b').click();

    const response = await rscResponsePromise;
    const request = response.request();
    const skipHeader = request.headers()['x-waku-router-skip'];

    expect(skipHeader).toBeTruthy();
    const skipped = JSON.parse(skipHeader as string) as Record<string, string>;
    expect(Array.isArray(skipped)).toBe(false);
    expect('root' in skipped).toBe(true);

    const payload = await response.text();
    expect(payload).toContain('SKIP_B_PAGE_MARKER');
    expect(payload).not.toContain('SKIP_STATIC_LAYOUT_MARKER');
    expect(payload).not.toContain('SKIP_A_PAGE_MARKER');

    await expect(
      page.getByRole('heading', { name: 'SKIP_B_PAGE_MARKER' }),
    ).toBeVisible();
    await expect(page.getByTestId('skip-static-layout-marker')).toHaveText(
      'SKIP_STATIC_LAYOUT_MARKER',
    );
  });

  test('unstable_prefetchOnView triggers prefetch when link enters viewport', async ({
    page,
  }) => {
    const prefetchedViewRequests: string[] = [];
    page.on('request', (request) => {
      const requestUrl = request.url();
      if (
        request.method() === 'GET' &&
        requestUrl.includes('/RSC/R/view-target.txt')
      ) {
        prefetchedViewRequests.push(requestUrl);
      }
    });

    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);
    expect(prefetchedViewRequests).toHaveLength(0);

    await page.getByTestId('prefetch-on-view-link').scrollIntoViewIfNeeded();
    await expect.poll(() => prefetchedViewRequests.length).toBeGreaterThan(0);
    const afterPrefetchCount = prefetchedViewRequests.length;

    await page.getByTestId('prefetch-on-view-link').click();
    await expect(
      page.getByRole('heading', { name: 'View Target' }),
    ).toBeVisible();
    expect(prefetchedViewRequests).toHaveLength(afterPrefetchCount);
  });

  // The prefetch also warms the route's client chunk: decoding the prefetched
  // RSC pulls /view-target's client component, so clicking loads no new JS.
  // Regression test for https://github.com/wakujs/waku/issues/2099.
  test('unstable_prefetchOnView warms the route client chunk', async ({
    page,
    mode,
  }) => {
    test.skip(mode === 'DEV', 'production chunking');
    const jsUrls: string[] = [];
    page.on('request', (request) => {
      const url = request.url();
      if (request.method() === 'GET' && url.endsWith('.js')) {
        jsUrls.push(url);
      }
    });

    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);
    // /view-target's chunk is not used on /start, so it is not loaded yet.
    const initialJs = new Set(jsUrls);

    await page.getByTestId('prefetch-on-view-link').scrollIntoViewIfNeeded();
    // The prefetch fetches and decodes the route, pulling its client chunk.
    await expect.poll(() => jsUrls.some((u) => !initialJs.has(u))).toBe(true);

    const beforeClick = new Set(jsUrls);
    await page.getByTestId('prefetch-on-view-link').click();
    await expect(page.getByTestId('view-target-marker')).toBeVisible();

    const newJsOnClick = jsUrls.filter((u) => !beforeClick.has(u));
    expect(newJsOnClick).toEqual([]);
  });

  test('unstable_prefetchOnEnter triggers prefetch on hover', async ({
    page,
  }) => {
    const prefetchedEnterRequests: string[] = [];
    page.on('request', (request) => {
      const requestUrl = request.url();
      if (
        request.method() === 'GET' &&
        requestUrl.includes('/RSC/R/next.txt')
      ) {
        prefetchedEnterRequests.push(requestUrl);
      }
    });

    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);
    expect(prefetchedEnterRequests).toHaveLength(0);

    await page.getByTestId('prefetch-on-enter-link').hover();
    await expect.poll(() => prefetchedEnterRequests.length).toBeGreaterThan(0);
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
  });

  test('useNavigationStatus pending reflects async transition state', async ({
    page,
  }) => {
    await page.route('**/RSC/R/next.txt**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 300));
      await route.continue();
    });

    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);
    await expect(page.getByTestId('not-pending-indicator')).toBeVisible();

    await page.getByTestId('pending-link').click();
    await expect(page.getByTestId('pending-indicator')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Next' })).toBeVisible();
    await expect(page.getByTestId('pending-indicator')).toHaveCount(0);
  });

  test('pending stays until a client-only async resolves, not just data loading', async ({
    page,
  }) => {
    // The target route's RSC loads normally, but it renders a client component
    // that suspends with no data fetch. Pending must persist until that
    // client-only async resolves, proving it tracks the transition.
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    const rscResponse = page.waitForResponse('**/RSC/R/pending-client.txt**');
    await page.getByTestId('pending-client-link').click();

    // Once the RSC has arrived the router's data loading is done, yet the
    // pending indicator must STILL be visible because the client component is
    // suspended. This is the load-bearing assertion: a data-loading-only
    // implementation would have cleared pending by now.
    await rscResponse;
    await expect(page.getByTestId('pending-client-indicator')).toBeVisible();
    await expect(page.getByTestId('client-suspense-content')).toHaveCount(0);

    // Release the client-only async from the still-mounted start page; the
    // transition settles and pending clears.
    await page.getByTestId('resolve-client-suspense').click();
    await expect(page.getByTestId('client-suspense-content')).toBeVisible();
    await expect(page.getByTestId('pending-client-indicator')).toHaveCount(0);
  });

  test('client notFound navigation uses /404 page content when present', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.getByTestId('go-trigger-not-found').click();

    await expect(
      page.getByRole('heading', { name: 'Custom 404' }),
    ).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/404');
    await expect(page.getByTestId('route-query')).toHaveText('');
    await expect(page).toHaveURL(/\/trigger-not-found$/);
  });

  test('client redirect navigation resolves to target and replaces history entry', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.getByTestId('go-trigger-redirect').click();

    await expect(page.getByRole('heading', { name: 'Next' })).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/next');
    await expect(page.getByTestId('route-query')).toHaveText('from=redirect');
    await expect(page).toHaveURL(/\/next\?from=redirect$/);

    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Start' })).toBeVisible();
    await expect(page).toHaveURL(/\/start$/);
  });

  test('client navigation to missing route with /404 page renders /404 content', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/start`);
    await waitForHydration(page);

    await page.getByTestId('go-missing').click();

    await expect(
      page.getByRole('heading', { name: 'Custom 404' }),
    ).toBeVisible();
    await expect(page.getByTestId('route-path')).toHaveText('/404');
    await expect(page).toHaveURL(/\/missing$/);
  });
});
