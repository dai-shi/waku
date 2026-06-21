import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('javascript-template');

test.describe('javascript template coverage', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('builds JavaScript pages, hydrates client code, and loads routes', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('title')).toHaveText('Waku JavaScript');
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByTestId('count')).toHaveText('Count: 1');
    await page.getByRole('link', { name: 'About page' }).click();
    await expect(page.getByTestId('title')).toHaveText('About JavaScript');
  });

  test('loads managed middleware modules from JavaScript', async ({
    request,
  }) => {
    const response = await request.get(`http://localhost:${port}/about/`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toMatch(/\/about$/);
  });
});
