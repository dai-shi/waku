import { expect } from '@playwright/test';
import { prepareStandaloneSetup, test } from './utils.js';

const startApp = prepareStandaloneSetup('monorepo');

for (const packageManager of ['npm', 'pnpm', 'yarn'] as const) {
  test.describe(`${packageManager} monorepo`, () => {
    let port: number;
    let stopApp: () => Promise<void>;

    test.beforeAll(async ({ mode }) => {
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
      const messages: string[] = [];
      page.on('console', (msg) => messages.push(msg.text()));
      const errors: string[] = [];
      page.on('pageerror', (err) => errors.push(err.message));
      await page.goto(`http://localhost:${port}`);
      await expect(page.getByTestId('header')).toHaveText('Waku');
      // it should show context value from provider correctly
      await expect(page.getByTestId('context-consumer-mounted')).toBeVisible();
      await expect(page.getByTestId('context-consumer-value')).toHaveText(
        'provider value',
      );
      expect(messages.join('\n')).not.toContain('hydration-mismatch');
      expect(errors.join('\n')).not.toContain('Minified React error #418');
    });
  });
}
