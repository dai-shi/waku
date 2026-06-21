import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('react-tweet');

test.describe('react-tweet example coverage', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp?.();
  });

  test('renders react-tweet components with optimizeDeps exclusion', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);

    await expect(page).toHaveTitle('Waku react-tweet');
    await expect(page.getByTestId('tweet-api-type')).toHaveText('function');
  });
});
