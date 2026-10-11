import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('define-router');

test.describe(`define-router`, () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('home', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('home-title')).toHaveText('Home');
    await page.locator("a[href='/foo']").click();
    await expect(page.getByTestId('foo-title')).toHaveText('Foo');
  });

  test('foo', async ({ page }) => {
    await page.goto(`http://localhost:${port}/foo`);
    await expect(page.getByTestId('foo-title')).toHaveText('Foo');
  });

  test('typed hrefs produce HTTP redirects without a codec registry', async ({
    request,
  }) => {
    const response = await request.get(
      `http://localhost:${port}/typed-redirect`,
      {
        maxRedirects: 0,
      },
    );
    expect(response.status()).toBe(307);
    expect(response.headers().location).toBe('/foo?q=redirected');
  });

  test('typed hrefs render and navigate from a Server Component', async ({
    page,
  }) => {
    const response = await page.goto(`http://localhost:${port}/server-search`);
    expect(await response!.text()).toContain('href="/foo?q=server"');
    const link = page.getByRole('link', { name: 'Server search', exact: true });
    await expect(link).toHaveAttribute('href', '/foo?q=server');
    await link.click();
    await expect(page.getByTestId('foo-title')).toHaveText('Foo');
    expect(page.url()).toBe(`http://localhost:${port}/foo?q=server`);
  });

  test('Link remains a client reference passed through component props', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/server-search`);
    const link = page.getByRole('link', { name: 'Composed search' });
    await expect(link).toHaveAttribute('href', '/foo?q=composed');
    await link.click();
    await expect(page.getByTestId('foo-title')).toHaveText('Foo');
    expect(page.url()).toBe(`http://localhost:${port}/foo?q=composed`);
  });

  test('local search navigation after a direct noSsr load', async ({
    page,
  }) => {
    const response = await page.goto(`http://localhost:${port}/no-ssr-search`);
    expect(await response!.text()).not.toContain('Search foo');
    const link = page.getByRole('link', { name: 'Search foo' });
    await expect(link).toHaveAttribute('href', '/foo?q=after');
    await link.click();
    await expect(page.getByTestId('foo-title')).toHaveText('Foo');
    expect(page.url()).toBe(`http://localhost:${port}/foo?q=after`);
  });

  test('bar1 (dynamic page + static slice)', async ({ page, mode }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('home-title')).toHaveText('Home');
    const sliceText = (await page
      .getByTestId('slice001')
      .textContent()) as string;
    expect(sliceText.startsWith('Slice 001')).toBeTruthy();
    await page.locator("a[href='/bar1']").click();
    await expect(page.getByTestId('bar1-title')).toHaveText('Bar1');
    const sliceText2 = page.getByTestId('slice001');
    await expect(sliceText2).toHaveText(sliceText);
    const randomText = (await page
      .getByTestId('bar1-random')
      .textContent()) as string;
    await page.reload();
    await expect(page.getByTestId('bar1-title')).toHaveText('Bar1');
    const sliceText3 = page.getByTestId('slice001');
    await expect(sliceText3).toHaveText(sliceText);
    // eslint-disable-next-line playwright/no-conditional-in-test
    if (mode === 'PRD') {
      // eslint-disable-next-line playwright/no-conditional-expect
      await expect(page.getByTestId('bar1-random')).not.toHaveText(randomText);
    }
  });

  test('bar2 (static page + dynamic slice)', async ({ page, mode }) => {
    await page.goto(`http://localhost:${port}/bar2`);
    await waitForHydration(page);
    await expect(page.getByTestId('bar2-title')).toHaveText('Bar2');
    const randomText = (await page
      .getByTestId('bar2-random')
      .textContent()) as string;
    const sliceText = (await page
      .getByTestId('slice002')
      .textContent()) as string;
    expect(sliceText.startsWith('Slice 002')).toBeTruthy();
    await page.locator("a[href='/']").click();
    await expect(page.getByTestId('home-title')).toHaveText('Home');
    await page.locator("a[href='/bar2']").click();
    await expect(page.getByTestId('bar2-title')).toHaveText('Bar2');
    const sliceText2 = page.getByTestId('slice002');
    await expect(sliceText2).not.toHaveText(sliceText);
    // eslint-disable-next-line playwright/no-conditional-in-test
    if (mode === 'PRD') {
      // eslint-disable-next-line playwright/no-conditional-expect
      await expect(page.getByTestId('bar2-random')).toHaveText(randomText);
    }
  });

  test('baz1 (dynamic page + lazy static slice)', async ({ page, mode }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('home-title')).toHaveText('Home');
    const sliceText = (await page
      .getByTestId('slice001')
      .textContent()) as string;
    expect(sliceText.startsWith('Slice 001')).toBeTruthy();
    await page.locator("a[href='/baz1']").click();
    await expect(page.getByTestId('baz1-title')).toHaveText('Baz1');
    const randomText = (await page
      .getByTestId('baz1-random')
      .textContent()) as string;
    const sliceText2 = page.getByTestId('slice001');
    await expect(sliceText2).toHaveText(sliceText);
    await page.reload();
    await expect(page.getByTestId('baz1-title')).toHaveText('Baz1');
    // eslint-disable-next-line playwright/no-conditional-in-test
    if (mode === 'PRD') {
      // eslint-disable-next-line playwright/no-conditional-expect
      await expect(page.getByTestId('baz1-random')).not.toHaveText(randomText);
    }
  });

  test('baz2 (static page + lazy dynamic slice)', async ({ page, mode }) => {
    await page.goto(`http://localhost:${port}/baz2`);
    await waitForHydration(page);
    await expect(page.getByTestId('baz2-title')).toHaveText('Baz2');
    const randomText = (await page
      .getByTestId('baz2-random')
      .textContent()) as string;
    const sliceText = (await page
      .getByTestId('slice002')
      .textContent()) as string;
    expect(sliceText.startsWith('Slice 002')).toBeTruthy();
    await page.locator("a[href='/']").click();
    await expect(page.getByTestId('home-title')).toHaveText('Home');
    await page.locator("a[href='/baz2']").click();
    await expect(page.getByTestId('baz2-title')).toHaveText('Baz2');
    // eslint-disable-next-line playwright/no-wait-for-timeout
    await page.waitForTimeout(100); // need to wait to refetch the slice
    const sliceText2 = page.getByTestId('slice002');
    await expect(sliceText2).not.toHaveText(sliceText);
    // eslint-disable-next-line playwright/no-conditional-in-test
    if (mode === 'PRD') {
      // eslint-disable-next-line playwright/no-conditional-expect
      await expect(page.getByTestId('baz2-random')).toHaveText(randomText);
    }
  });

  test('direct baz1 (static page + lazy dynamic slice)', async ({ page }) => {
    await page.route(/.*\/RSC\/.*/, async (route) => {
      await new Promise((r) => setTimeout(r, 100));
      await route.continue();
    });
    await page.goto(`http://localhost:${port}/baz1`);
    await expect(page.getByTestId('baz1-title')).toHaveText('Baz1');
    await expect(page.getByTestId('slice001-loading')).toBeVisible();
    await expect(page.getByTestId('slice001')).toBeVisible();
    const sliceText = await page.getByTestId('slice001').textContent();
    expect(sliceText?.startsWith('Slice 001')).toBeTruthy();
  });

  test('direct baz2 (static page + lazy dynamic slice)', async ({ page }) => {
    await page.route(/.*\/RSC\/.*/, async (route) => {
      await new Promise((r) => setTimeout(r, 100));
      await route.continue();
    });
    await page.goto(`http://localhost:${port}/baz2`);
    await expect(page.getByTestId('baz2-title')).toHaveText('Baz2');
    await expect(page.getByTestId('slice002-loading')).toBeVisible();
    await expect(page.getByTestId('slice002')).toBeVisible();
    const sliceText = await page.getByTestId('slice002').textContent();
    expect(sliceText?.startsWith('Slice 002')).toBeTruthy();
  });

  test('api hi', async () => {
    const res = await fetch(`http://localhost:${port}/api/hi`);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hello world!');
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

  test('a pre render redirect resolves as a soft navigation', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.evaluate(() => {
      (window as unknown as { __beforeMoved?: true }).__beforeMoved = true;
    });

    await page.locator("a[href='/moved']").click();

    await expect(page.getByTestId('foo-title')).toHaveText('Foo');
    expect(page.url()).toBe(`http://localhost:${port}/foo`);
    // the marker survives only if the document was kept, not replaced
    expect(
      await page.evaluate(
        () => (window as unknown as { __beforeMoved?: true }).__beforeMoved,
      ),
    ).toBe(true);
  });

  test('leaving replaces the entry, so back does not bounce', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    const before = await page.evaluate(() => history.length);

    await page.locator("a[href='/moved-hash']").click();
    await page.waitForURL(`http://localhost:${port}/foo#bottom`);

    // the entry the reader never saw is replaced, not stacked
    expect(await page.evaluate(() => history.length)).toBe(before + 1);
    await page.goBack();
    await expect(page.getByRole('heading').first()).not.toHaveText('Foo');
  });

  test('a redirect no route can answer navigates the document', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);

    await page.locator("a[href='/moved-hash']").click();

    // the router cannot resolve it, so the browser has to go there itself
    await page.waitForURL(`http://localhost:${port}/foo#bottom`);
    await expect(page.getByTestId('foo-title')).toHaveText('Foo');
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

test.describe('define-router: static server', { tag: '@prd' }, () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async () => {
    ({ port, stopApp } = await startApp('STATIC'));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('loads a lazy immutable slice without a runtime server', async ({
    page,
  }) => {
    const [payload] = await Promise.all([
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/RSC/S/slice001.txt',
      ),
      page.goto(`http://localhost:${port}/static-lazy`),
    ]);
    await expect(page.getByTestId('static-lazy-title')).toHaveText(
      'Static lazy',
    );
    await expect(page.getByTestId('slice001')).toContainText('Slice 001');
    expect(payload.status()).toBe(200);
  });

  test('local search navigation from static noSsr HTML', async ({ page }) => {
    const response = await page.goto(
      `http://localhost:${port}/no-ssr-search-static`,
    );
    expect(await response!.text()).not.toContain('Search foo');
    const link = page.getByRole('link', { name: 'Search foo' });
    await expect(link).toHaveAttribute('href', '/foo?q=after');
    await link.click();
    await expect(page.getByTestId('foo-title')).toHaveText('Foo');
    expect(page.url()).toBe(`http://localhost:${port}/foo?q=after`);
  });

  test('typed hrefs work in static HTML without JavaScript', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    try {
      const page = await context.newPage();
      await page.goto(`http://localhost:${port}/server-search-static`);
      await page.getByRole('link', { name: 'Static server search' }).click();
      await expect(page.getByTestId('foo-title')).toHaveText('Foo');
      expect(page.url()).toBe(`http://localhost:${port}/foo?q=static`);
    } finally {
      await context.close();
    }
  });
});
