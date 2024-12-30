import { expect } from '@playwright/test';

import { test, prepareNormalSetup } from './utils.js';

const startApp = prepareNormalSetup('ssr-context-provider');

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`ssr-context-provider: ${mode}`, () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp(mode));
    });
    test.afterAll(async () => {
      await stopApp();
    });

    test('show context value', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await page.waitForSelector('[data-testid="mounted"]');
      await expect(page.getByTestId('value')).toHaveText('provider value');
    });

    test('no js environment', async ({ browser }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
      });
      const page = await context.newPage();
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('value')).toHaveText('provider value');
      await page.close();
      await context.close();
    });
  });
}
