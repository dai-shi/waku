import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('custom-user-adapter');

test.describe('custom-user-adapter', () => {
  let port: number;
  let stopApp: () => Promise<void>;
  let fixtureDir: string;

  test.beforeAll(async () => {
    ({ port, stopApp, fixtureDir } = await startApp('PRD'));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('runs post build from in-project adapter', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('custom-user-adapter-heading')).toHaveText(
      'Hello from custom user adapter',
    );

    const summaryPath = join(
      fixtureDir,
      'dist',
      'custom-user-adapter-post-build.json',
    );
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    expect(summary).toEqual({
      marker: 'custom-user-adapter',
    });
  });
});
