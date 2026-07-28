import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('cloudflare-adapter');

test.describe('cloudflare adapter', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async () => {
    ({ port, stopApp } = await startApp('DEV'));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('runs queue handlers', async ({ request }) => {
    const url = `http://localhost:${port}/queue`;
    const response = await request.post(url, { data: 'hello' });
    expect(response.ok()).toBe(true);

    await expect
      .poll(async () => (await request.get(url)).text())
      .toBe('hello');
  });
});
