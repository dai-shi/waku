import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('tanstack-router');

test.describe('tanstack router example coverage', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('lets a client router own subroutes under a Waku shell', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('tanstack-page')).toHaveText('TanStack home');
    await expect(page.getByTestId('tanstack-devtools-type')).toHaveText(
      'function',
    );

    await page.getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL(`http://localhost:${port}/about`);
    await expect(page.getByTestId('tanstack-page')).toHaveText(
      'TanStack about',
    );

    await page.reload();
    await waitForHydration(page);
    await expect(page.getByTestId('tanstack-page')).toHaveText(
      'TanStack about',
    );
  });
});
