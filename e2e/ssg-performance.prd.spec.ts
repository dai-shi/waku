import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('ssg-performance');

test.describe(`high volume static site generation`, () => {
  test('build and verify', async ({ page }) => {
    test.setTimeout(60000);
    const { port, stopApp } = await startApp('PRD');
    await page.goto(`http://localhost:${port}/path-3`);
    await expect(page.getByRole('heading')).toHaveText('/path-3');
    await stopApp();
  });
});
