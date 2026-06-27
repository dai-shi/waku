import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('wildcard-api-routes');

test.describe('wildcard api routes', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('catch all route can match as index route', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByText('Catch All Pages Route')).toBeVisible();
  });

  test(`api route matches before wildcard route`, async ({ page }) => {
    // misc route matches wildcard:
    await page.goto(`http://localhost:${port}/foo`);
    await expect(page.getByRole('heading', { name: '/foo' })).toBeVisible();

    // api route request
    const response = await page.request.get(
      `http://localhost:${port}/api/greet`,
    );
    const text = await response.text();
    expect(text).toBe('Greetings from the API!');
  });

  test('api standard route matches before wildcard route', async ({ page }) => {
    const response = await page.request.get(
      `http://localhost:${port}/api/greet`,
    );
    const text = await response.text();
    expect(text).toBe('Greetings from the API!');
  });

  test('non-terminal catch-all matches with zero segments', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/about`);
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(page.getByTestId('locale')).toHaveText('');
  });

  test('non-terminal catch-all matches with one segment', async ({ page }) => {
    await page.goto(`http://localhost:${port}/zh/about`);
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(page.getByTestId('locale')).toHaveText('zh');
  });

  test('non-terminal catch-all matches with multiple segments', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/zh/cn/about`);
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
    await expect(page.getByTestId('locale')).toHaveText('zh/cn');
  });

  test(`static nested catch-all route matches before root catch-all route`, async ({
    page,
  }) => {
    const response = await page.request.get(
      `http://localhost:${port}/api/v1/foo/bar`,
    );
    const text = await response.text();
    expect(text).toBe('API Wildcard!');

    const response2 = await page.request.get(
      `http://localhost:${port}/api/foo/bar`,
    );
    const text2 = await response2.text();
    expect(text2).toBe('/api root catch-all');
  });

  test('root catch-all api does not intercept client navigation', async ({
    page,
  }) => {
    const response = await page.request.get(
      `http://localhost:${port}/files/path/to/file.txt`,
    );
    expect(await response.text()).toBe('files:path/to/file.txt');

    await page.goto(`http://localhost:${port}/`);
    await page.getByRole('link', { name: 'About' }).click();
    await expect(page.getByRole('heading', { name: 'About' })).toBeVisible();
  });

  test('root catch-all api does not intercept no-js form actions', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    const submittedName = `No JS ${Date.now()}`;
    try {
      await page.goto(`http://localhost:${port}/files/action`);
      await expect(
        page.getByRole('heading', { name: 'Action under API wildcard' }),
      ).toBeVisible();
      await page.getByLabel('Name').fill(submittedName);
      await page.getByRole('button', { name: 'Submit Action' }).click();
      await expect(page.getByTestId('action-message')).toHaveText(
        `Submitted: ${submittedName}`,
      );
    } finally {
      await page.close();
      await context.close();
    }
  });
});
