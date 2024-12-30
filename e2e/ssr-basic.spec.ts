import { expect } from '@playwright/test';

import { test, prepareNormalSetup } from './utils.js';

const startApp = prepareNormalSetup('ssr-basic');

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`ssr-basic: ${mode}`, () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp(mode));
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

    test('vercel ai', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      const aiLocator = page.getByTestId('vercel-ai');
      await aiLocator.waitFor({
        state: 'visible',
      });
      await expect(aiLocator.getByTestId('ai-state-user')).toHaveText('guest');
      await expect(aiLocator.getByTestId('ui-state-count')).toHaveText('0');
      await aiLocator.getByTestId('action-foo').click();
      await expect(aiLocator.getByTestId('ai-state-user')).toHaveText('admin');
      await expect(aiLocator.getByTestId('ui-state-count')).toHaveText('1');
      await aiLocator.getByTestId('action-foo').click();
      await expect(aiLocator.getByTestId('ui-state-count')).toHaveText('2');
      await aiLocator.getByTestId('action-foo').click();
      await expect(aiLocator.getByTestId('ui-state-count')).toHaveText('3');
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
      const aiLocator = page.getByTestId('vercel-ai');
      await expect(aiLocator.getByTestId('ai-state-user')).toHaveText('guest');
      await expect(aiLocator.getByTestId('ui-state-count')).toHaveText('0');
      await page.close();
      await context.close();
    });
  });
}
