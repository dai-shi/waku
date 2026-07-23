import { type Page, expect } from '@playwright/test';
import {
  FETCH_ERROR_MESSAGES,
  prepareNormalSetup,
  test,
  waitForHydration,
  waitForSelectorText,
} from './utils.js';

const startApp = prepareNormalSetup('create-pages');

// Long suspense flows are more stable with direct DOM clicks.
const clickClientLink = async (page: Page, href: string) => {
  await page.evaluate((targetHref) => {
    const link = document.querySelector(`a[href="${targetHref}"]`);
    if (!(link instanceof HTMLAnchorElement)) {
      throw new Error(`Missing link: ${targetHref}`);
    }
    link.click();
  }, href);
};

// The pending indicator can flash very briefly. Detect "seen at least once"
// with a short-lived observer instead of asserting an instant count.
const waitForSelectorSeen = async (page: Page, selector: string) => {
  await expect
    .poll(
      async () =>
        page.evaluate(
          (selector) =>
            new Promise<boolean>((resolve) => {
              let settled = false;
              let timer: ReturnType<typeof setTimeout> | null = null;
              let observer: MutationObserver | null = null;
              const done = (value: boolean) => {
                if (settled) {
                  return;
                }
                settled = true;
                if (observer) {
                  observer.disconnect();
                }
                if (timer) {
                  clearTimeout(timer);
                }
                resolve(value);
              };
              const isVisible = () => !!document.querySelector(selector);
              if (isVisible()) {
                done(true);
                return;
              }
              observer = new MutationObserver(() => {
                if (isVisible()) {
                  done(true);
                }
              });
              observer.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
              });
              timer = setTimeout(() => done(false), 3_000);
            }),
          selector,
        ),
      { timeout: 4_000 },
    )
    .toBe(true);
};

const expectNoPageErrorFor = async (page: Page) => {
  const errors: string[] = [];
  const onPageError = (err: Error) => errors.push(err.message);

  page.on('pageerror', onPageError);
  try {
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await page.waitForTimeout(500);
  } finally {
    page.off('pageerror', onPageError);
  }

  expect(errors).toEqual([]);
};

test.describe(`create-pages`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  const serverOutput: string[] = [];

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode, {
      onServerOutput: (data) => serverOutput.push(data),
    }));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  const SELECTOR = '[data-testid="long-suspense-component"] h3';
  const PENDING_SELECTOR = '[data-testid="long-suspense-pending"]';

  test('home', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    const backgroundColor = await page.evaluate(() =>
      window
        .getComputedStyle(document.body)
        .getPropertyValue('background-color'),
    );
    expect(backgroundColor).toBe('rgb(254, 254, 254)');
    await expect(page.getByTestId('home-layout-render-count')).toHaveText(
      'Render Count: 1',
    );
    await page.reload();
    await expect(page.getByTestId('home-layout-render-count')).toHaveText(
      'Render Count: 1',
    );
  });

  test('foo', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page.locator("a[href='/foo']").click({ noWaitAfter: true });
    await waitForSelectorText(page, 'h2', 'Foo');

    await page.goto(`http://localhost:${port}/foo`);
    await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
  });

  test('search params (props.search + useSearch + setSearch)', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/search?q=hi&page=2`);
    await waitForHydration(page);
    // server component received the parsed, typed search
    await expect(page.getByTestId('server-search')).toHaveText(
      '{"q":"hi","page":2}',
    );
    // client useSearch resolved the same codec by id and re-parsed the query
    await expect(page.getByTestId('client-search')).toHaveText(
      '{"q":"hi","page":2}',
    );
    // setSearch serializes with the codec, navigates, and the route re-renders
    await page.getByTestId('next-page').click();
    await expect(page).toHaveURL(/[?&]page=3(&|$)/);
    await expect(page.getByTestId('client-search')).toHaveText(
      '{"q":"hi","page":3}',
    );
    await expect(page.getByTestId('server-search')).toHaveText(
      '{"q":"hi","page":3}',
    );
  });

  test('search params (cross-route push with typed search)', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    // push({ to: '/search', search }) serializes via the target route's codec,
    // resolved from the route -> codec id map shipped to the client
    await page.getByTestId('home-to-search').click();
    await expect(page).toHaveURL(/\/search\?q=hello&page=5$/);
    await expect(page.getByTestId('server-search')).toHaveText(
      '{"q":"hello","page":5}',
    );
    await expect(page.getByTestId('client-search')).toHaveText(
      '{"q":"hello","page":5}',
    );
  });

  test('search params (cross-route Link with typed search)', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    // <Link to={{ to: '/search', search }}> serializes via the target codec too
    await page.getByTestId('home-to-search-link').click();
    await expect(page).toHaveURL(/\/search\?q=linked&page=7$/);
    await expect(page.getByTestId('server-search')).toHaveText(
      '{"q":"linked","page":7}',
    );
    await expect(page.getByTestId('client-search')).toHaveText(
      '{"q":"linked","page":7}',
    );
  });

  test('search params (cross-route Link serializes its href during SSR)', async () => {
    // The cross-route <Link to={{ to: '/search', search }}> serializes its href
    // on the server. This requires the route -> codec id map to be available
    // during SSR (not only the browser-injected global), otherwise the link
    // throws while rendering and its href is missing from the server HTML.
    const res = await fetch(`http://localhost:${port}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-testid="home-to-search-link"');
    expect(html).toContain('/search?q=linked');
  });

  test('search params (typed structured redirect serializes search via server codec)', async ({
    page,
  }) => {
    // unstable_redirect({ to: '/search', search }) is typed against /search's
    // codec and serialized server-side via the codec-instance registry; the
    // browser follows the 307 to the built href.
    await page.goto(`http://localhost:${port}/redirect-to-search`);
    await waitForHydration(page);
    await expect(page).toHaveURL(/\/search\?q=hi&page=2$/);
    await expect(page.getByTestId('server-search')).toHaveText(
      '{"q":"hi","page":2}',
    );
  });

  test('search params (typed structured redirect to a dynamic route with a codec)', async ({
    request,
  }) => {
    // resolves the codec for a dynamic route (/items/[id]) and serializes both
    // params and search into the Location (catches a route-key normalization
    // mismatch, which would otherwise throw instead of redirecting)
    const res = await request.get(`http://localhost:${port}/redirect-to-item`, {
      maxRedirects: 0,
    });
    expect(res.status()).toBe(307);
    expect(res.headers()['location']).toBe('/items/7?q=hi&page=2');
  });

  test('dynamic', async ({ page }) => {
    await page.goto(`http://localhost:${port}/dynamic`);
    await expect(page.getByRole('navigation')).toHaveText('Dynamic Layout');
    await expect(
      page.getByRole('heading', { name: 'Dynamic Page' }),
    ).toBeVisible();
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

  test("nested/cat's pajamas", async ({ page }) => {
    await page.goto(`http://localhost:${port}/nested/cat's%20pajamas`);
    await expect(
      page.getByRole('heading', { name: "Dynamic: cat's%20pajamas" }),
    ).toBeVisible();
  });

  test('jump', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page.locator("a[href='/foo']").click({ noWaitAfter: true });
    await waitForSelectorText(page, 'h2', 'Foo');
    await page.locator('text=Jump to random page').click();
    await expectNoPageErrorFor(page);
    await expect(
      page.getByRole('heading', { level: 2, name: 'Foo' }),
    ).toBeHidden();
    await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
  });

  test('jump with setState', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page.locator("a[href='/foo']").click({ noWaitAfter: true });
    await waitForSelectorText(page, 'h2', 'Foo');
    await page.locator('text=Jump with setState').click();
    await expect(
      page.getByRole('heading', { name: 'Baz', exact: true }),
    ).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('server action rerenders route with js', async ({ page }) => {
    const submittedName = `With JS ${Date.now()}`;
    await page.goto(`http://localhost:${port}/rerender-action`);
    await waitForHydration(page);
    await expect(
      page.getByRole('heading', { name: 'Rerender Action' }),
    ).toBeVisible();
    await page.getByLabel('Name').fill(submittedName);
    await page.getByRole('button', { name: 'Submit Rerender' }).click();
    await expect(page.getByTestId('rerender-action-message')).toHaveText(
      `Submitted: ${submittedName}`,
    );
    await expect(page.locator('body')).not.toContainText('getRerender');
  });

  test('server action rerenders route without js', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    const submittedName = `No JS ${Date.now()}`;
    try {
      await page.goto(`http://localhost:${port}/rerender-action`);
      await expect(
        page.getByRole('heading', { name: 'Rerender Action' }),
      ).toBeVisible();
      await page.getByLabel('Name').fill(submittedName);
      await page.getByRole('button', { name: 'Submit Rerender' }).click();
      await expect(page.getByTestId('rerender-action-message')).toHaveText(
        `Submitted: ${submittedName}`,
      );
      await expect(page.locator('body')).not.toContainText('getRerender');
    } finally {
      await page.close();
      await context.close();
    }
  });

  test('errors', async ({ page }) => {
    serverOutput.splice(0);
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page.locator("a[href='/error']").click();
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
    ).toHaveText('Internal Server Error');
    await expect
      .poll(() => serverOutput.join(''))
      .toContain('Input is required');
  });

  test('server function unreachable', async ({ page, mode, browserName }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page.locator("a[href='/error']").click();
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
    ).toHaveText(FETCH_ERROR_MESSAGES[browserName]);
    ({ port, stopApp } = await startApp(mode));
  });

  test('server page unreachable', async ({ page, mode, browserName }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await stopApp();
    await page.locator("a[href='/error']").click();
    // Default router client error boundary is reached
    await expect(page.locator('p')).toContainText(
      FETCH_ERROR_MESSAGES[browserName],
    );
    ({ port, stopApp } = await startApp(mode));
  });

  // https://github.com/wakujs/waku/issues/1255
  test('long suspense', async ({ page }) => {
    await page.goto(`http://localhost:${port}/long-suspense/1`);
    await waitForHydration(page);
    await expect(page.getByTestId('long-suspense-component')).toHaveCount(2);
    await expect(
      page.getByRole('heading', { name: 'Long Suspense Page 1' }),
    ).toBeVisible();
    const pendingSeen = waitForSelectorSeen(page, PENDING_SELECTOR);
    await clickClientLink(page, '/long-suspense/2');
    await page.waitForFunction(
      ([pendingSel, sel]) => {
        const pathname = window.location.pathname;
        const pendingElement = document.querySelector(pendingSel);
        const heading = document.querySelector(sel);
        return (
          pendingElement?.textContent === 'Pending...' &&
          pathname === '/long-suspense/1' &&
          heading?.textContent === 'Long Suspense Page 1'
        );
      },
      [PENDING_SELECTOR, SELECTOR] as const,
      { timeout: 1000 },
    );
    await pendingSeen;
    await waitForSelectorText(page, SELECTOR, 'Long Suspense Page 2');
    const pendingSeen2 = waitForSelectorSeen(page, PENDING_SELECTOR);
    await clickClientLink(page, '/long-suspense/3');
    await page.waitForFunction(
      ([pendingSel, sel]) => {
        const pathname = window.location.pathname;
        const pendingElement = document.querySelector(pendingSel);
        const heading = document.querySelector(sel);
        return (
          pendingElement?.textContent === 'Pending...' &&
          pathname === '/long-suspense/2' &&
          heading?.textContent === 'Long Suspense Page 2'
        );
      },
      [PENDING_SELECTOR, SELECTOR] as const,
      { timeout: 1000 },
    );
    await pendingSeen2;
    await waitForSelectorText(page, SELECTOR, 'Long Suspense Page 3');
    const pendingSeen3 = waitForSelectorSeen(page, PENDING_SELECTOR);
    await clickClientLink(page, '/long-suspense/2');
    await page.waitForFunction(
      ([pendingSel, sel]) => {
        const pathname = window.location.pathname;
        const pendingElement = document.querySelector(pendingSel);
        const heading = document.querySelector(sel);
        return (
          pendingElement?.textContent === 'Pending...' &&
          pathname === '/long-suspense/3' &&
          heading?.textContent === 'Long Suspense Page 3'
        );
      },
      [PENDING_SELECTOR, SELECTOR] as const,
      { timeout: 1000 },
    );
    await pendingSeen3;
    await waitForSelectorText(page, SELECTOR, 'Long Suspense Page 2');
  });

  // https://github.com/wakujs/waku/issues/1437
  test('static long suspense', async ({ page }) => {
    await page.goto(`http://localhost:${port}/static-long-suspense/4`);
    await waitForHydration(page);
    // no loading state for static
    await expect(page.getByTestId('long-suspense')).toHaveCount(0);
    await expect(page.getByTestId('long-suspense-component')).toHaveCount(2);
    await expect(
      page.getByRole('heading', { name: 'Long Suspense Page 4' }),
    ).toBeVisible();
    const pendingSeen = waitForSelectorSeen(page, PENDING_SELECTOR);
    await clickClientLink(page, '/static-long-suspense/5');
    await pendingSeen;
    await waitForSelectorText(page, SELECTOR, 'Long Suspense Page 5');
    await clickClientLink(page, '/static-long-suspense/6');
    await waitForSelectorText(page, SELECTOR, 'Long Suspense Page 6');
  });

  test('api hi', async () => {
    const res = await fetch(`http://localhost:${port}/api/hi`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello world!');
  });

  test('api url with search params', async () => {
    const res = await fetch(`http://localhost:${port}/api/url?foo=bar`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe(
      `url http://localhost:${port}/api/url?foo=bar`,
    );
  });

  test('api hi.txt', async () => {
    const res = await fetch(`http://localhost:${port}/api/hi.txt`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello from a text file!');
  });

  test('api empty', async () => {
    const res = await fetch(`http://localhost:${port}/api/empty`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  test(
    'static api is served from build-time pre-generation',
    { tag: '@prd' },
    async () => {
      // `/api/cache-time` is a static API whose handler returns
      // `Date.now()`. With build-time pre-generation it was emitted at
      // build (before this test started), so the returned timestamp is
      // older than `curr`. Without pre-generation the handler would run
      // at request time, after `curr`. The route is dedicated so this
      // test is the first request to it in the process.
      const curr = Date.now();
      const res = await fetch(`http://localhost:${port}/api/cache-time`);
      expect(res.status).toBe(200);
      const time = Number(await res.text());
      expect(time).toBeLessThan(curr);
    },
  );

  test('api hi with POST', async () => {
    const res = await fetch(`http://localhost:${port}/api/hi`, {
      method: 'POST',
      body: 'from the test!',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('POST to hello world! from the test!');
  });

  test('api static paths', async () => {
    const res1 = await fetch(`http://localhost:${port}/api/static-paths/foo`);
    expect(res1.status).toBe(200);
    await expect(res1.json()).resolves.toEqual({ name: 'foo' });

    const res2 = await fetch(
      `http://localhost:${port}/api/static-paths/bar.json`,
    );
    expect(res2.status).toBe(200);
    await expect(res2.json()).resolves.toEqual({ name: 'bar.json' });
    // proper content-type on static server requires explicit extension
    // depending on deployment platform
    expect(res2.headers.get('content-type')).toContain('application/json');
  });

  test('api formData', async () => {
    const formData = new FormData();
    formData.append('test-string', 'value');
    formData.append(
      'test-file',
      new File(['data'], 'test.txt', { type: 'text/plain' }),
    );
    const res = await fetch(`http://localhost:${port}/api/form-data`, {
      method: 'POST',
      body: formData,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      keys: ['test-string', 'test-file'],
      testString: 'value',
      testFile: { name: 'test.txt', data: 'data' },
    });
  });

  test('api handler receives params from apiContext', async () => {
    const res = await fetch(`http://localhost:${port}/api/echo/123`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ params: { id: '123' } });
  });

  test('api handler receives wildcard params from apiContext', async () => {
    const res = await fetch(
      `http://localhost:${port}/api/echo/books/fiction/scifi`,
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      params: { category: 'books', rest: ['fiction', 'scifi'] },
    });
  });

  test('static api wildcard passes correct params', async () => {
    const res1 = await fetch(
      `http://localhost:${port}/api/static-wildcard/a/b`,
    );
    expect(res1.status).toBe(200);
    expect(await res1.json()).toEqual({ params: { slugs: ['a', 'b'] } });

    const res2 = await fetch(`http://localhost:${port}/api/static-wildcard/c`);
    expect(res2.status).toBe(200);
    expect(await res2.json()).toEqual({ params: { slugs: ['c'] } });
  });

  test('exactPath', async ({ page }) => {
    await page.goto(`http://localhost:${port}/exact/[slug]/[...wild]`);
    await expect(
      page.getByRole('heading', { name: 'EXACTLY!!' }),
    ).toBeVisible();
  });

  test('group', async ({ page }) => {
    await page.goto(`http://localhost:${port}/test`);
    await expect(
      page.getByRole('heading', { name: 'Group Page' }),
    ).toBeVisible();
  });

  test('group layout', async ({ page }) => {
    await page.goto(`http://localhost:${port}/test`);
    await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '/(group) Layout' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: '/test Layout' }),
    ).toBeHidden();
  });

  test('group layout static + dynamic', async ({ page }) => {
    const whatTime = async (selector: string) =>
      new Date(
        (await page
          .getByRole('heading', { name: selector })
          .textContent())!.replace(selector + ' ', ''),
      ).getTime();

    await page.goto(`http://localhost:${port}/nested-layouts`);
    await waitForHydration(page);
    await expect(
      page.getByRole('heading', { name: 'Dynamic Layout' }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Static Layout' }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Nested Layouts' }),
    ).toBeVisible();
    const dynamicTime = await whatTime('Dynamic Layout');
    const staticTime = await whatTime('Static Layout');
    expect(staticTime).toBeLessThan(dynamicTime);

    await page.getByRole('link', { name: 'Home' }).click();
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await page.getByRole('link', { name: 'Nested Layouts' }).click();
    await expect(
      page.getByRole('heading', { name: 'Nested Layouts page' }),
    ).toBeVisible();
    const dynamicTime2 = await whatTime('Dynamic Layout');
    const staticTime2 = await whatTime('Static Layout');
    expect(dynamicTime2).not.toEqual(dynamicTime);
    expect(staticTime2).toEqual(staticTime);
    expect(dynamicTime2).not.toEqual(staticTime2);
  });

  test('dynamic layout receives parent slug but not child slug', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/layout-props/dynamic/en/post-1`);
    await expect(
      page.getByRole('heading', {
        name: 'Dynamic Parent Layout',
        exact: true,
        level: 2,
      }),
    ).toBeVisible();
    await expect(page.getByTestId('dynamic-layout-props-keys')).toHaveText(
      'lang',
    );
    await expect(page.getByTestId('dynamic-layout-props-lang')).toHaveText(
      'en',
    );
    await expect(page.getByTestId('dynamic-layout-props-slug')).toHaveText(
      'missing',
    );
    await expect(
      page.getByRole('heading', { name: 'Dynamic Layout Props Page post-1' }),
    ).toBeVisible();
  });

  test('static layout receives parent slug but not child slug', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/layout-props/static/en/post-1`);
    await expect(
      page.getByRole('heading', {
        name: 'Static Parent Layout',
        exact: true,
        level: 2,
      }),
    ).toBeVisible();
    await expect(page.getByTestId('static-layout-props-keys')).toHaveText(
      'lang',
    );
    await expect(page.getByTestId('static-layout-props-lang')).toHaveText('en');
    await expect(page.getByTestId('static-layout-props-slug')).toHaveText(
      'missing',
    );
    await expect(
      page.getByRole('heading', { name: 'Static Layout Props Page post-1' }),
    ).toBeVisible();
  });

  test('dynamic layout receives all parent slugs in a complex path but not child slugs', async ({
    page,
  }) => {
    await page.goto(
      `http://localhost:${port}/layout-props/dynamic-complex/aaa/parent-b/ccc/parent-d/eee/child-f`,
    );
    await expect(
      page.getByRole('heading', {
        name: 'Dynamic Complex Layout',
        exact: true,
        level: 2,
      }),
    ).toBeVisible();
    await expect(
      page.getByTestId('dynamic-complex-layout-props-keys'),
    ).toHaveText('bbb,ddd');
    await expect(
      page.getByTestId('dynamic-complex-layout-props-bbb'),
    ).toHaveText('parent-b');
    await expect(
      page.getByTestId('dynamic-complex-layout-props-ddd'),
    ).toHaveText('parent-d');
    await expect(
      page.getByTestId('dynamic-complex-layout-props-fff'),
    ).toHaveText('missing');
    await expect(
      page.getByRole('heading', {
        name: 'Dynamic Complex Layout Props Page child-f',
      }),
    ).toBeVisible();
  });

  test('static grouped layout receives parent slugs and keeps cache separated by concrete path', async ({
    page,
  }) => {
    await page.goto(
      `http://localhost:${port}/layout-props/static-grouped/en/docs/post-1`,
    );
    await expect(
      page.getByRole('heading', {
        name: 'Static Grouped Layout',
        exact: true,
        level: 2,
      }),
    ).toBeVisible();
    await expect(
      page.getByTestId('static-grouped-layout-props-keys'),
    ).toHaveText('lang,section');
    await expect(
      page.getByTestId('static-grouped-layout-props-lang'),
    ).toHaveText('en');
    await expect(
      page.getByTestId('static-grouped-layout-props-section'),
    ).toHaveText('docs');
    await expect(
      page.getByTestId('static-grouped-layout-props-slug'),
    ).toHaveText('missing');
    await expect(
      page.getByRole('heading', {
        name: 'Static Grouped Layout Props Page post-1',
      }),
    ).toBeVisible();

    await page.goto(
      `http://localhost:${port}/layout-props/static-grouped/fr/blog/post-2`,
    );
    await expect(
      page.getByTestId('static-grouped-layout-props-keys'),
    ).toHaveText('lang,section');
    await expect(
      page.getByTestId('static-grouped-layout-props-lang'),
    ).toHaveText('fr');
    await expect(
      page.getByTestId('static-grouped-layout-props-section'),
    ).toHaveText('blog');
    await expect(
      page.getByTestId('static-grouped-layout-props-slug'),
    ).toHaveText('missing');
    await expect(
      page.getByRole('heading', {
        name: 'Static Grouped Layout Props Page post-2',
      }),
    ).toBeVisible();

    await page.goto(
      `http://localhost:${port}/layout-props/static-grouped/en/docs/post-1`,
    );
    await expect(
      page.getByTestId('static-grouped-layout-props-lang'),
    ).toHaveText('en');
    await expect(
      page.getByTestId('static-grouped-layout-props-section'),
    ).toHaveText('docs');
  });

  test(
    'static layout under dynamic layout is pre-cached at build time',
    { tag: '@prd' },
    async ({ browser }) => {
      const getStaticTime = async (port: number) => {
        const context = await browser.newContext();
        const page = await context.newPage();
        await page.goto(`http://localhost:${port}/nested-layouts`);
        const text = await page
          .getByRole('heading', { name: 'Static Layout' })
          .textContent();
        await context.close();
        return text!.replace('Static Layout ', '');
      };
      // Stop the shared server, start two fresh instances and compare.
      // If the static layout is pre-cached at build time, both runs see
      // the same timestamp. If rendered at runtime, they differ.
      await stopApp();
      const run1 = await startApp('PRD');
      const time1 = await getStaticTime(run1.port);
      await run1.stopApp();
      const run2 = await startApp('PRD');
      const time2 = await getStaticTime(run2.port);
      await run2.stopApp();
      // Restart the shared server for remaining tests
      ({ port, stopApp } = await startApp('PRD'));
      expect(time1).toBe(time2);
    },
  );

  test('no ssr', async ({ page }) => {
    await page.goto(`http://localhost:${port}/no-ssr`);
    await expect(
      page.getByRole('heading', { name: 'No SSR', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Only client component', exact: true }),
    ).toBeVisible();
  });

  test('slices with render=dynamic', async ({ page }) => {
    await page.goto(`http://localhost:${port}/slices`);
    await waitForHydration(page);
    // basic test
    const staticSliceText = (await page
      .getByTestId('slice001')
      .textContent()) as string;
    expect(staticSliceText.startsWith('Slice 001')).toBeTruthy();
    const dynamicSliceText = (await page
      .getByTestId('slice002')
      .textContent()) as string;
    expect(dynamicSliceText.startsWith('Slice 002')).toBeTruthy();

    await page.getByRole('link', { name: 'Home' }).click();
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await page.getByRole('link', { name: 'Slices' }).click();
    await expect(page.getByRole('heading', { name: 'Slices' })).toBeVisible();

    // test dynamic and static slices behavior after soft navigation
    const staticSliceText2 = page.getByTestId('slice001');
    await expect(staticSliceText2).toHaveText(staticSliceText);
    const dynamicSliceText2 = page.getByTestId('slice002');
    await expect(dynamicSliceText2).not.toHaveText(dynamicSliceText);

    // test static slices behavior after hard navigation
    await page.reload();
    const staticSliceText3 = page.getByTestId('slice001');
    await expect(staticSliceText3).toHaveText(staticSliceText);
  });

  test('slices with lazy', async ({ page }) => {
    await page.route(/.*\/RSC\/.*/, async (route) => {
      await new Promise((r) => setTimeout(r, 100));
      await route.continue();
    });
    await page.goto(`http://localhost:${port}/slices`);
    await expect(page.getByTestId('slice003-loading')).toBeVisible();
    await expect(page.getByTestId('slice003')).toHaveText('Slice 003');
  });

  test('slugs with dots - version numbers', async ({ page }) => {
    await page.goto(`http://localhost:${port}/docs/v1.0.0/read`);
    await expect(
      page.getByRole('heading', { name: 'Version: v1.0.0' }),
    ).toBeVisible();

    await page.goto(`http://localhost:${port}/docs/v2.1.5/read`);
    await expect(
      page.getByRole('heading', { name: 'Version: v2.1.5' }),
    ).toBeVisible();
  });

  test('slugs with spaces and dots', async ({ page }) => {
    await page.goto(`http://localhost:${port}/docs/Mr.-Mime/read`);
    await expect(
      page.getByRole('heading', { name: 'Version: Mr.-Mime' }),
    ).toBeVisible();
  });
});

test.describe(`create-pages STATIC`, { tag: '@prd' }, () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async () => {
    ({ port, stopApp } = await startApp('STATIC'));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('no ssr', async ({ page }) => {
    await page.goto(`http://localhost:${port}/no-ssr`);
    await expect(
      page.getByRole('heading', { name: 'No SSR', exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Only client component', exact: true }),
    ).toBeVisible();
  });

  test('no ssr in no js environment', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/no-ssr`);
    await expect(page.getByText('Not Found')).toBeHidden();
    await page.close();
    await context.close();
  });

  test('slices with render=static', async ({ page }) => {
    await page.route(/.*\/RSC\/.*/, async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await route.continue();
    });
    await page.goto(`http://localhost:${port}/static-slices`);
    await waitForHydration(page);
    await expect(page.getByTestId('slice001-loading')).toBeVisible();
    const sliceText = await page.getByTestId('slice001').textContent();
    expect(sliceText?.startsWith('Slice 001')).toBeTruthy();
  });

  test('slugs with dots - version numbers', async ({ page }) => {
    await page.goto(`http://localhost:${port}/docs/v1.0.0/read`);
    await expect(
      page.getByRole('heading', { name: 'Version: v1.0.0' }),
    ).toBeVisible();

    await page.goto(`http://localhost:${port}/docs/v2.1.5/read`);
    await expect(
      page.getByRole('heading', { name: 'Version: v2.1.5' }),
    ).toBeVisible();
  });

  test('slugs with spaces and dots', async ({ page }) => {
    await page.goto(`http://localhost:${port}/docs/Mr.-Mime/read`);
    await expect(
      page.getByRole('heading', { name: 'Version: Mr.-Mime' }),
    ).toBeVisible();
  });
});
