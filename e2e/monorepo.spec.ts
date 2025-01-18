import { expect } from '@playwright/test';

import { test, prepareStandaloneSetup } from './utils.js';

const startApp = prepareStandaloneSetup('monorepo');

for (const mode of ['DEV', 'PRD'] as const) {
  for (const packageManager of ['npm', 'pnpm', 'yarn'] as const) {
    test.describe(`${packageManager} monorepo: ${mode}`, () => {
      let port: number;
      let stopApp: () => Promise<void>;
      test.beforeAll(async () => {
        ({ port, stopApp } = await startApp(
          mode,
          packageManager,
          'packages/waku-project',
        ));
      });
      test.afterAll(async () => {
        await stopApp();
      });

      test('renders the home page', async ({ page }) => {
        await page.goto(`http://localhost:${port}`);
        await expect(page.getByTestId('header')).toHaveText('Waku');
        // it should show context value from provider correctly
        await page.waitForSelector('[data-testid="context-consumer-mounted"]');
        await expect(page.getByTestId('context-consumer-value')).toHaveText(
          'provider value',
        );
      });
    });
  }
}
