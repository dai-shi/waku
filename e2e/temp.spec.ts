import { expect } from '@playwright/test';

import { test, prepareNormalSetup } from './utils.js';

const startApp = prepareNormalSetup('define-router');

test.describe('temp', () => {
  let port: number;
  let stopApp: () => Promise<void>;
  test.beforeAll(async () => {
    ({ port, stopApp } = await startApp('DEV'));
  });
  test.afterAll(async () => {
    await stopApp();
  });

  test('home', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('home-title')).toHaveText('Home');
    await page.getByText('Foo').click();
    await expect(page.getByTestId('foo-title')).toHaveText('Foo');
  });
});
