import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('typescript-template', {
  fixtureDir: fileURLToPath(new URL('../templates/01_basic', import.meta.url)),
});

test.describe('typescript template', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('renders the home page, hydrates the counter, and navigates', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page).toHaveTitle('Waku');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Waku', exact: true }),
    ).toBeVisible();
    await expect(page.getByText('Hello world!')).toBeVisible();

    await expect(page.getByText('Count: 0')).toBeVisible();
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByText('Count: 1')).toBeVisible();

    await page.getByRole('link', { name: 'About page' }).click();
    await expect(page).toHaveURL(`http://localhost:${port}/about`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'About Waku' }),
    ).toBeVisible();
  });

  test('redirects trailing slashes via managed middleware in dev', async ({
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
