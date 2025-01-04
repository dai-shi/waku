import { expect } from '@playwright/test';

import { test, prepareNormalSetup } from './utils.js';

const startApp = prepareNormalSetup('rsc-basic');

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`rsc-basic: ${mode}`, () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp(mode));
    });
    test.afterAll(async () => {
      await stopApp();
    });

    test('basic', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('app-name')).toHaveText('Waku');
      await expect(
        page.getByTestId('client-counter').getByTestId('count'),
      ).toHaveText('0');
      await page.getByTestId('client-counter').getByTestId('increment').click();
      await expect(
        page.getByTestId('client-counter').getByTestId('count'),
      ).toHaveText('1');
      await page.getByTestId('client-counter').getByTestId('increment').click();
      await expect(
        page.getByTestId('client-counter').getByTestId('count'),
      ).toHaveText('2');
      await expect(
        page.getByTestId('server-ping').getByTestId('pong'),
      ).toBeEmpty();
      await page.getByTestId('server-ping').getByTestId('ping').click();
      await expect(
        page.getByTestId('server-ping').getByTestId('pong'),
      ).toHaveText('pong');
      await expect(
        page.getByTestId('server-ping').getByTestId('counter'),
      ).toHaveText('0');
      await page.getByTestId('server-ping').getByTestId('increase').click();
      await expect(
        page.getByTestId('server-ping').getByTestId('counter'),
      ).toHaveText('1');
      await page.getByTestId('server-ping').getByTestId('increase').click();
      await expect(
        page.getByTestId('server-ping').getByTestId('counter'),
      ).toHaveText('2');
    });

    test('server action', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('app-name')).toHaveText('Waku');
      await expect(page.getByTestId('ai-internal-provider')).toHaveText(
        'globalThis.actions: ["foo"]',
      );
      const result = await page.evaluate(() => {
        // @ts-expect-error no types
        return globalThis.actions.foo();
      });
      expect(result).toBe(0);
    });

    test('server throws', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('app-name')).toHaveText('Waku');
      await page.getByTestId('server-throws').getByTestId('throws').click();
      await expect(
        page.getByTestId('server-throws').getByTestId('throws-error'),
      ).toHaveText('Something unexpected happened');
    });

    test('server handle network errors', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('app-name')).toHaveText('Waku');
      await page.getByTestId('server-throws').getByTestId('success').click();
      await expect(
        page.getByTestId('server-throws').getByTestId('throws-success'),
      ).toHaveText('It worked');
      await page.getByTestId('server-throws').getByTestId('reset').click();
      await expect(
        page.getByTestId('server-throws').getByTestId('throws-success'),
      ).toHaveText('init');
      await stopApp();
      await page.getByTestId('server-throws').getByTestId('success').click();
      await expect(
        page.getByTestId('server-throws').getByTestId('throws-error'),
      ).toHaveText('Failed to fetch');
      ({ port, stopApp } = await startApp(mode));
    });
  });
}
