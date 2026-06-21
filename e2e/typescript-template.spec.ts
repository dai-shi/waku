import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('typescript-template');

test.describe('typescript template coverage', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('builds the default TypeScript template stack and hydrates client code', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page).toHaveTitle('Waku');
    await expect(page.getByTestId('title')).toHaveText('Waku TypeScript');
    await expect(page.getByTestId('count')).toHaveText('Count: 0');
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByTestId('count')).toHaveText('Count: 1');

    await page.getByRole('link', { name: 'About page' }).click();
    await expect(page).toHaveURL(`http://localhost:${port}/about`);
    await expect(page.getByTestId('title')).toHaveText('About TypeScript');
  });

  test('loads managed middleware modules from TypeScript in dev', async ({
    mode,
    request,
  }) => {
    test.skip(mode !== 'DEV', 'DEV only middleware redirect assertion');

    const response = await request.get(`http://localhost:${port}/about/`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(301);
    expect(response.headers().location).toMatch(/\/about$/);
  });

  test('serves the static trailing-slash page in production', async ({
    mode,
    request,
  }) => {
    test.skip(mode !== 'PRD', 'PRD only static output assertion');

    const response = await request.get(`http://localhost:${port}/about/`, {
      maxRedirects: 0,
    });
    expect(response.status()).toBe(200);
  });
});
