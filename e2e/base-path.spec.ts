import { type Page, expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('base-path');

test.describe(`base-path`, () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('api', async ({ request }) => {
    const baseUrl = `http://localhost:${port}/custom/base/`;

    // get
    const resGet = await request.get(`${baseUrl}hello`);
    expect(resGet.ok()).toBe(true);
    expect(await resGet.json()).toEqual({
      ok: true,
      request: {
        handler: 'GET',
        method: 'GET',
        pathname: '/hello',
      },
    });

    // post
    const resPost = await request.post(`${baseUrl}hello`, {
      data: 'hello',
    });
    expect(resPost.ok()).toBe(true);
    expect(await resPost.json()).toEqual({
      ok: true,
      request: {
        handler: 'POST',
        method: 'POST',
        pathname: '/hello',
        text: 'hello',
      },
    });

    // get trailing slash
    const resGetTrailing = await request.get(`${baseUrl}hello/`);
    expect(resGetTrailing.ok()).toBe(true);
    expect(await resGetTrailing.json()).toEqual({
      ok: true,
      request: {
        handler: 'GET',
        method: 'GET',
        pathname: '/hello/',
      },
    });

    // post trailing slash
    const resPostTrailing = await request.post(`${baseUrl}hello/`, {
      data: 'hello',
    });
    expect(resPostTrailing.ok()).toBe(true);
    expect(await resPostTrailing.json()).toEqual({
      ok: true,
      request: {
        handler: 'POST',
        method: 'POST',
        pathname: '/hello/',
        text: 'hello',
      },
    });
  });

  test('redirect Location carries basePath', async ({ request }) => {
    // unstable_redirect('/static') must emit a base-prefixed Location so the
    // browser stays within the app (the redirect is built app-relative)
    const res = await request.get(
      `http://localhost:${port}/custom/base/redirect`,
      { maxRedirects: 0 },
    );
    expect(res.status()).toBe(307);
    expect(res.headers()['location']).toBe('/custom/base/static');
  });

  test('router', async ({ page }) => {
    const baseUrl = `http://localhost:${port}/custom/base/`;
    await page.goto(baseUrl);
    await waitForHydration(page);

    // push
    await page
      .getByRole('button', { name: 'dynamic-push', exact: true })
      .click();
    await page.waitForURL(`${baseUrl}dynamic`);
    await expect(
      page.getByRole('heading', { name: 'Dynamic page' }),
    ).toBeVisible();

    // push trailing slash
    await page.goto(baseUrl);
    await waitForHydration(page);
    await page.getByRole('button', { name: 'dynamic-push-trailing' }).click();
    await page.waitForURL(`${baseUrl}dynamic/`);
    await expect(
      page.getByRole('heading', { name: 'Dynamic page' }),
    ).toBeVisible();

    // replace
    await page.goto(baseUrl);
    await waitForHydration(page);
    await page.getByRole('button', { name: 'dynamic-replace' }).click();
    await page.waitForURL(`${baseUrl}dynamic`);
    await expect(
      page.getByRole('heading', { name: 'Dynamic page' }),
    ).toBeVisible();
  });

  // eslint-disable-next-line playwright/expect-expect
  test('basic DEV', async ({ page, mode }) => {
    test.skip(mode !== 'DEV', 'DEV only test');
    await basicTest(page, `http://localhost:${port}/custom/base/`);
  });

  // eslint-disable-next-line playwright/expect-expect
  test('basic PRD', async ({ page, mode }) => {
    test.skip(mode !== 'PRD', 'PRD only test');
    await basicTest(page, `http://localhost:${port}/custom/base/`);

    // test static
    await stopApp();
    ({ port, stopApp } = await startApp(mode, {
      cmd: 'pnpm start-static',
    }));
    await basicTest(page, `http://localhost:${port}/custom/base/`);
  });
});

async function basicTest(page: Page, baseUrl: string) {
  await page.goto(baseUrl);
  await waitForHydration(page);

  // client component
  await expect(page.getByTestId('client-counter')).toHaveText('Count: 0');
  await page.getByTestId('client-counter').click();
  await expect(page.getByTestId('client-counter')).toHaveText('Count: 1');

  // style
  await expect(page.locator('.test-style')).toHaveCSS(
    'color',
    'rgb(255, 150, 0)',
  );

  // client side navigation
  await page.getByRole('link', { name: 'Static' }).click();
  await page.waitForURL(`${baseUrl}static`);
  await expect(
    page.getByRole('heading', { name: 'Static page' }),
  ).toBeVisible();

  // ssr
  await page.goto(`${baseUrl}static`);
  await expect(
    page.getByRole('heading', { name: 'Static page' }),
  ).toBeVisible();

  await page.goto(`${baseUrl}static/`);
  await expect(
    page.getByRole('heading', { name: 'Static page' }),
  ).toBeVisible();
}
