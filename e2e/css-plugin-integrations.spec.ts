import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('css-plugin-integrations');

test.describe('css plugin integrations', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('renders vanilla-extract and StyleX styles in server and client components', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);

    await expect(page.getByTestId('vanilla-server')).toHaveCSS(
      'color',
      'rgb(0, 128, 0)',
    );
    await expect(page.getByTestId('stylex-server')).toHaveClass(/x/);
    await expect(page.getByTestId('client-counter')).toHaveClass(/x/);
    await page.getByTestId('client-counter').click();
    await expect(page.getByTestId('client-counter')).toHaveText(
      'Client count: 1',
    );
  });
});
