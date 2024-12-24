import { expect } from '@playwright/test';

import { test, prepareNormalSetup } from './utils.js';

const startApp = await prepareNormalSetup('ssr-swr');

for (const isDev of [true, false]) {
  test.describe(`ssr-swr: ${isDev ? 'DEV' : 'PRD'}`, () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp(isDev));
    });
    test.afterAll(async () => {
      await stopApp();
    });

    test('increase counter', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('app-name')).toHaveText('Waku');
      await expect(page.getByTestId('count')).toHaveText('0');
      await page.getByTestId('increment').click();
      await page.getByTestId('increment').click();
      await page.getByTestId('increment').click();
      await expect(page.getByTestId('count')).toHaveText('3');
    });

    test('no js environment should have first screen', async ({ browser }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
      });
      const page = await context.newPage();
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('app-name')).toHaveText('Waku');
      await expect(page.getByTestId('count')).toHaveText('0');
      await page.getByTestId('increment').click();
      await expect(page.getByTestId('count')).toHaveText('0');
      await page.close();
      await context.close();
    });
  });
}
