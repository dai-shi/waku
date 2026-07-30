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

  test('a redirected rsc request hands the page to the browser', async ({
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
    // the marker is gone only if the document was replaced, not soft navigated
    expect(
      await page.evaluate(
        () => (window as unknown as { __beforeMoved?: true }).__beforeMoved,
      ),
    ).toBeUndefined();
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
