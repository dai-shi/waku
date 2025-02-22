import { expect } from '@playwright/test';

import { test, prepareNormalSetup } from './utils.js';

const startApp = prepareNormalSetup('rsc-asset');

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`rsc-asset: ${mode}`, () => {
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

      // server asset
      await expect(page.getByTestId('server-file')).toContainText(
        'server asset: test-server-ok',
      );

      // client asset
      await page.getByTestId('client-link').click();
      await page.getByText('test-client-ok').click();
    });
  });
}
