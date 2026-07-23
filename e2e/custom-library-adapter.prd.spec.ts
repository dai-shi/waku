import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { prepareStandaloneSetup, test } from './utils.js';

const startApp = prepareStandaloneSetup('custom-library-adapter');

test.describe('custom-library-adapter', () => {
  let port: number;
  let stopApp: () => Promise<void>;
  let standaloneDir: string;

  test.beforeAll(async () => {
    ({ port, stopApp, standaloneDir } = await startApp('PRD', 'pnpm'));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('runs post build from dependency adapter', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('custom-adapter-heading')).toHaveText(
      'Hello from custom adapter',
    );

    const summaryPath = join(
      standaloneDir,
      'dist',
      'custom-adapter-post-build.json',
    );
    const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
    expect(summary).toEqual({
      marker: 'custom-adapter-post-build',
    });
  });
});
