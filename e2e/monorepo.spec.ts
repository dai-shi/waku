import { expect } from '@playwright/test';

import { test, prepareStandaloneSetup } from './utils.js';

const startApp = prepareStandaloneSetup('monorepo');

for (const mode of ['DEV', 'PRD'] as const) {
  test.describe(`monorepo: ${mode}`, () => {
    let port: number;
    let stopApp: () => Promise<void>;
    test.beforeAll(async () => {
      ({ port, stopApp } = await startApp(mode, "packages/waku-project"));
    });
    test.afterAll(async () => {
      await stopApp();
    });

    test('renders the home page', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      await expect(page.getByTestId('header')).toHaveText('Waku');
    });
  });
}
