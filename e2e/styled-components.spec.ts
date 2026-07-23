import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('styled-components');

const defineTests = (getPort: () => number) => {
  test('SSR renders styles without JS', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    const port = getPort();
    await page.goto(`http://localhost:${port}/`);
    const counterButton = page.getByRole('button', { name: 'Count: 0' });
    await expect(counterButton).toBeVisible();
    await expect(counterButton).toHaveCSS(
      'border-top-color',
      'rgb(255, 165, 0)',
    );
    await page.close();
    await context.close();
  });
};

test.describe('styled-components', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  defineTests(() => port);
});

test.describe('styled-components: static build', { tag: '@prd' }, () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async () => {
    ({ port, stopApp } = await startApp('STATIC'));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  defineTests(() => port);
});
