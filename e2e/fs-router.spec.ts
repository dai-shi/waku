import { expect } from '@playwright/test';
import {
  prepareNormalSetup,
  test,
  waitForHydration,
  waitForSelectorText,
} from './utils.js';

const startApp = prepareNormalSetup('fs-router');

test.describe('fs-router', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
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
    expect(backgroundColor).toBe('rgba(0, 0, 0, 0)');
  });

  test('foo', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page.locator("a[href='/foo']").click({ noWaitAfter: true });
    await waitForSelectorText(page, 'h2', 'Foo');

    await page.goto(`http://localhost:${port}/foo`);
    await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
  });

  test('reloads on build id mismatch', async ({ page }) => {
    let navigations = 0;
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) {
        navigations++;
      }
    });
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);

    const html = await page.content();
    const buildId = html.match(/\\"_buildId\\":\\"([^\\]+)\\"/)?.[1] ?? '';
    expect(buildId.length).toBeGreaterThan(0);

    await page.route('**/RSC/**', async (route) => {
      const response = await route.fetch();
      const body = await response.text();
      await route.fulfill({
        status: response.status(),
        headers: response.headers(),
        body: body.replaceAll(buildId, 'tampered'),
      });
    });

    await page.locator("a[href='/foo']").click();
    await expect
      .poll(() => navigations, { timeout: 10_000 })
      .toBeGreaterThanOrEqual(2);
    await expect(page).toHaveURL(`http://localhost:${port}/foo`);
  });

  test('foo with trailing slash', async ({ page }) => {
    await page.goto(`http://localhost:${port}/foo/`);
    await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
  });

  test('nested/foo', async ({ page }) => {
    // /nested/foo is defined as a staticPath of /nested/[id] which matches this layout
    await page.goto(`http://localhost:${port}/nested/foo`);
    await expect(
      page.getByRole('heading', { name: 'Nested / foo' }),
    ).toBeVisible();
  });

  test('nested/baz', async ({ page }) => {
    await page.goto(`http://localhost:${port}/nested/baz`);
    await expect(
      page.getByRole('heading', { name: 'Nested Layout' }),
    ).toBeVisible();
  });

  test('nested/baz with trailing slash', async ({ page }) => {
    await page.goto(`http://localhost:${port}/nested/baz/`);
    await expect(
      page.getByRole('heading', { name: 'Nested Layout' }),
    ).toBeVisible();
  });

  test('search params (fs-router getConfig codec, typegen)', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/search?q=hi&page=2`);
    await waitForHydration(page);
    // props.search parsed on the server by the route's getConfig codec
    await expect(page.getByTestId('server-search')).toHaveText(
      '{"q":"hi","page":2}',
    );
    // useSearch resolves the same codec on the client (provider in _layout)
    await expect(page.getByTestId('client-search')).toHaveText(
      '{"q":"hi","page":2}',
    );
    // setSearch serializes with the codec and navigates
    await page.getByTestId('next-page').click();
    await expect(page).toHaveURL(/[?&]page=3(&|$)/);
    await expect(page.getByTestId('client-search')).toHaveText(
      '{"q":"hi","page":3}',
    );
    await expect(page.getByTestId('server-search')).toHaveText(
      '{"q":"hi","page":3}',
    );
  });

  test('search params (grouped route, normalized path keys)', async ({
    page,
  }) => {
    // a route inside a (group) is keyed by its groupless path everywhere; the
    // client useSearch must resolve via the same normalized key in the
    // route -> codec id map (the codec is shared with /search by id)
    await page.goto(`http://localhost:${port}/grouped-search?q=hi&page=2`);
    await waitForHydration(page);
    await expect(page.getByTestId('grouped-server-search')).toHaveText(
      '{"q":"hi","page":2}',
    );
    await expect(page.getByTestId('grouped-client-search')).toHaveText(
      '{"q":"hi","page":2}',
    );
  });

  test('search params (Zod-backed codec via typegen)', async ({ page }) => {
    // the codec is attached via getConfig and typed via generated pages.gen.ts;
    // no hand-written `declare module` augmentation is needed
    await page.goto(`http://localhost:${port}/zod-search?q=hi&page=2`);
    await waitForHydration(page);
    await expect(page.getByTestId('zod-server-search')).toHaveText(
      '{"q":"hi","page":2}',
    );
    await expect(page.getByTestId('zod-client-search')).toHaveText(
      '{"q":"hi","page":2}',
    );
  });

  test('search params (Zod codec rejects an invalid query with 400)', async () => {
    const res = await fetch(`http://localhost:${port}/zod-search?page=0`);
    expect(res.status).toBe(400);
  });

  test('search params (nuqs-backed codec via typegen)', async ({ page }) => {
    await page.goto(`http://localhost:${port}/nuqs-search?q=hi&page=2`);
    await waitForHydration(page);
    await expect(page.getByTestId('nuqs-server-search')).toHaveText(
      '{"q":"hi","page":2}',
    );
    await expect(page.getByTestId('nuqs-client-search')).toHaveText(
      '{"q":"hi","page":2}',
    );
  });

  test('search params (nuqs codec rejects an invalid query with 400)', async () => {
    // the codec loads with { strict: true }, so a bad value throws -> 400
    const res = await fetch(`http://localhost:${port}/nuqs-search?page=abc`);
    expect(res.status).toBe(400);
  });

  test('static-nested encoded path with trailing slash', async ({ page }) => {
    await page.goto(`http://localhost:${port}/static-nested/encoded%20path/`);
    await expect(
      page.getByRole('heading', { name: 'Nested / encoded%20path' }),
    ).toBeVisible();
  });

  test('check hydration error', async ({ page }) => {
    const messages: string[] = [];
    page.on('console', (msg) => messages.push(msg.text()));
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    expect(messages.join('\n')).not.toContain('hydration-mismatch');
    expect(errors.join('\n')).not.toContain('Minified React error #418');
  });

  test('check hydration error with useId', async ({ page }) => {
    const messages: string[] = [];
    page.on('console', (msg) => messages.push(msg.text()));
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(`http://localhost:${port}/foo`);
    await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
    await waitForHydration(page);
    expect(messages.join('\n')).not.toContain('hydration-mismatch');
    expect(errors.join('\n')).not.toContain('Minified React error #418');
  });

  test('api hi', async () => {
    const res = await fetch(`http://localhost:${port}/hi`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Hello from API!');
  });

  test('api hi with trailing slash', async () => {
    const res = await fetch(`http://localhost:${port}/hi/`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('Hello from API!');
  });

  test('api hi.txt', async () => {
    const res = await fetch(`http://localhost:${port}/hi.txt`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello from a text file!');
  });

  test('api empty', async () => {
    const res = await fetch(`http://localhost:${port}/empty`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('');
  });

  test('api hi with POST', async () => {
    const res = await fetch(`http://localhost:${port}/hi`, {
      method: 'POST',
      body: 'from the test!',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('POST Hello from API! from the test!');
  });

  test('api hi with POST and trailing slash', async () => {
    const res = await fetch(`http://localhost:${port}/hi/`, {
      method: 'POST',
      body: 'from the test!',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('POST Hello from API! from the test!');
  });

  test('api has-default GET', async () => {
    const res = await fetch(`http://localhost:${port}/has-default`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('GET');
  });

  test('api has-default POST', async () => {
    const res = await fetch(`http://localhost:${port}/has-default`, {
      method: 'POST',
      body: 'from the test!',
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('default: POST');
  });

  test('api blog/rss.xml', async () => {
    const res = await fetch(`http://localhost:${port}/blog/rss.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/xml');
    const text = await res.text();
    expect(text).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(text).toContain('<rss version="2.0">');
  });

  test('_components', async ({ page }) => {
    await page.goto(`http://localhost:${port}/_components/Counter`);
    await expect(page.getByText('404 Not Found')).toBeVisible();
  });

  test('alt click', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await page.locator("a[href='/foo']").click({
      button: 'right',
    });
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
    await page.locator("a[href='/foo']").click({
      modifiers: ['ControlOrMeta'],
    });
    await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
  });

  test('encoded path - space - dynamic', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page.locator("a[href='/nested/encoded%20path']").click();
    await expect(
      page.getByRole('heading', { name: 'Nested / encoded%20path' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Nested / encoded%20path' }),
    ).toBeVisible();
  });

  test('encoded path - space - static', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page.locator("a[href='/static-nested/encoded%20path']").click();
    await expect(
      page.getByRole('heading', { name: 'Nested / encoded%20path' }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', { name: 'Nested / encoded%20path' }),
    ).toBeVisible();
  });

  test('encoded path - unicode - dynamic', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page
      .locator("a[href='/nested/encoded%E6%B8%AC%E8%A9%A6path']")
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Nested / encoded%E6%B8%AC%E8%A9%A6path',
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', {
        name: 'Nested / encoded%E6%B8%AC%E8%A9%A6path',
      }),
    ).toBeVisible();
  });

  test('encoded path - unicode - static', async ({ page }) => {
    await page.goto(`http://localhost:${port}`);
    await waitForHydration(page);
    await page
      .locator("a[href='/static-nested/encoded%E6%B8%AC%E8%A9%A6path']")
      .click();
    await expect(
      page.getByRole('heading', {
        name: 'Nested / encoded%E6%B8%AC%E8%A9%A6path',
      }),
    ).toBeVisible();
    await page.reload();
    await expect(
      page.getByRole('heading', {
        name: 'Nested / encoded%E6%B8%AC%E8%A9%A6path',
      }),
    ).toBeVisible();
  });

  test('check hydration error with unicode page', async ({ page }) => {
    const messages: string[] = [];
    page.on('console', (msg) => messages.push(msg.text()));
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto(`http://localhost:${port}/%E4%B8%AD%E6%96%87`);
    await waitForHydration(page);
    await expect(
      page.getByRole('heading', { name: '/%E4%B8%AD%E6%96%87' }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { name: '/中文' })).toBeHidden();
    expect(messages.join('\n')).not.toContain('hydration-mismatch');
    expect(errors.join('\n')).not.toContain('Minified React error #418');
  });

  test('slices', async ({ page }) => {
    await page.goto(`http://localhost:${port}/page-with-slices`);
    await waitForHydration(page);
    const sliceText = await page.getByTestId('slice001').textContent();
    expect(sliceText?.startsWith('Slice 001')).toBeTruthy();
    await expect(page.getByTestId('slice002')).toHaveText(
      'Slice 002: Hello from page with slices',
    );
  });

  test('slug slices', async ({ page }) => {
    await page.goto(`http://localhost:${port}/page-with-slices`);
    await waitForHydration(page);
    await expect(page.getByTestId('dynamic-slice')).toHaveText(
      'Dynamic Slice: test123',
    );
  });

  test('static slug slice is served from build-time cache', async ({
    page,
    mode,
  }) => {
    test.skip(mode !== 'PRD');
    // `_slices/cache-time/[id].tsx` is a static slug slice with
    // `staticPaths: ['foo']`. With build-time pre-rendering its
    // `Date.now()` is baked at build (before this test started), so
    // it must be older than `curr`. Without it, the slice would
    // render on the first PRD request — after `curr`. The route is
    // dedicated so this test is the first request to that slice.
    const curr = Date.now();
    await page.goto(`http://localhost:${port}/cache-time`);
    await waitForHydration(page);
    const text = (await page
      .getByTestId('cache-time-foo')
      .textContent()) as string;
    const time = Number(text.split(':')[1]);
    expect(time).toBeLessThan(curr);
  });

  test('static slug slice renders on the page', async ({ page }) => {
    await page.goto(`http://localhost:${port}/page-with-slices`);
    await waitForHydration(page);
    await expect(page.getByTestId('preset-slice')).toHaveText(
      'Preset Slice: foo',
    );
  });

  test('static layout inside a dynamic-path route is served from build-time cache', async ({
    page,
    mode,
  }) => {
    test.skip(mode !== 'PRD');
    // `/cache-check/[name]` is a dynamic-path route whose layout is
    // static and renders `Date.now()`. With build-time caching the
    // value was baked at build (before this test even started), so
    // it must be older than `curr`. Without it, the layout would
    // render at runtime on this first request, after `curr`.
    const curr = Date.now();
    await page.goto(`http://localhost:${port}/cache-check/foo`);
    const rendered = Number(
      (await page.getByTestId('cache-check-time').textContent()) ?? '',
    );
    expect(rendered).toBeLessThan(curr);
  });

  test('segment route in group route', async ({ page }) => {
    await page.goto(
      `http://localhost:${port}/page-with-segment/introducing-waku`,
    );
    const heading = page.getByRole('heading', { name: 'introducing-waku' });
    await expect(heading).toBeVisible();
  });

  test('segment route', async ({ page }) => {
    await page.goto(
      `http://localhost:${port}/page-with-segment/article/introducing-waku`,
    );
    const heading = page.getByRole('heading', { name: 'introducing-waku' });
    await expect(heading).toBeVisible();
  });

  test('css split', async ({ page }) => {
    // each ssr-ed page includes split css
    await page.goto(`http://localhost:${port}/css-split/page1`);
    await waitForHydration(page);
    await expect(page.getByText('css-split / page1 / index')).toHaveCSS(
      'color',
      'rgb(255, 0, 0)', // red
    );
    await page.goto(`http://localhost:${port}/css-split/page1/nested`);
    await waitForHydration(page);
    await expect(
      page.getByText('css-split / page1 / nested / index'),
    ).toHaveCSS(
      'color',
      'rgb(255, 0, 0)', // red
    );
    await page.goto(`http://localhost:${port}/css-split/page2`);
    await waitForHydration(page);
    await expect(page.getByText('css-split / page2 / index')).toHaveCSS(
      'color',
      'rgb(0, 0, 255)', // blue
    );
    await page.goto(`http://localhost:${port}/css-split/page2/nested`);
    await waitForHydration(page);
    await expect(
      page.getByText('css-split / page2 / nested / index'),
    ).toHaveCSS(
      'color',
      'rgb(0, 0, 255)', // blue
    );

    // client navigation cannot remove existing styles
    // page1 -> red
    // page2 -> blue
    // page1 -> blue (last stylesheet wins)
    await page.goto(`http://localhost:${port}/css-split/page1`);
    await waitForHydration(page);
    await expect(page.getByText('css-split / page1 / index')).toHaveCSS(
      'color',
      'rgb(255, 0, 0)', // red
    );
    await page.locator("a[href='/css-split/page2']").click();
    await expect(page.getByText('css-split / page2 / index')).toHaveCSS(
      'color',
      'rgb(0, 0, 255)', // blue
    );
    await page.locator("a[href='/css-split/page1']").click();
    await expect(page.getByText('css-split / page1 / index')).toHaveCSS(
      'color',
      'rgb(0, 0, 255)', // blue
    );
  });

  test('prefixed dynamic segment @[username]', async ({ page }) => {
    await page.goto(`http://localhost:${port}/@alice`);
    await expect(
      page.getByRole('heading', { name: 'Profile / alice' }),
    ).toBeVisible();
  });

  test('prefixed dynamic segment @[username] with different value', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/@bob`);
    await expect(
      page.getByRole('heading', { name: 'Profile / bob' }),
    ).toBeVisible();
  });

  test('static @foo takes priority over dynamic @[username]', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/@foo`);
    await expect(
      page.getByRole('heading', { name: 'Static Foo' }),
    ).toBeVisible();
  });

  test('subroute', async ({ page }) => {
    await page.goto(`http://localhost:${port}/subroute`);
    await expect(page.getByRole('heading', { name: 'Subroute' })).toBeVisible();
  });

  test('subroute catch-all', async ({ page }) => {
    await page.goto(`http://localhost:${port}/subroute/test`);
    await expect(
      page.getByRole('heading', { name: 'Subroute Catch-All: test' }),
    ).toBeVisible();

    await page.goto(`http://localhost:${port}/subroute/test/deep/path`);
    await expect(
      page.getByRole('heading', {
        name: 'Subroute Catch-All: test/deep/path',
      }),
    ).toBeVisible();
  });
});
