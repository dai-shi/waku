import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('minimal-examples');

test.describe('minimal examples coverage', () => {
  let port: number;
  let stopApp: () => Promise<void>;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp } = await startApp(mode));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  test('renders static minimal shell and hydrates client state', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByTestId('title')).toHaveText('Hello Waku');
    await expect(page.getByTestId('count')).toHaveText('Count: 0');
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByTestId('count')).toHaveText('Count: 1');
  });

  test('passes client children through minimal Slot/Children', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/children`);
    await waitForHydration(page);
    await expect(page.getByTestId('children-marker')).toHaveText(
      'server children wrapper',
    );
    await expect(page.getByTestId('client-child').first()).toHaveText(
      'client child',
    );
  });

  test('refetches an island slot and hydrates its children', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/islands`);
    await waitForHydration(page);
    await expect(page.getByTestId('island')).toContainText(
      'Dynamic island loaded',
    );
    await expect(page.getByTestId('count')).toHaveText('Count: 0');
    await page.getByRole('button', { name: 'Increment' }).click();
    await expect(page.getByTestId('count')).toHaveText('Count: 1');
  });

  test('supports waku-jotai in minimal mode', async ({ page }) => {
    await page.goto(`http://localhost:${port}/jotai`);
    await waitForHydration(page);
    await expect(page.getByTestId('jotai-count')).toHaveText('Jotai count: 1');
    await expect(page.getByTestId('double-count')).toHaveText(
      'Double count: 2',
    );
    await page.getByRole('button', { name: 'Increment jotai' }).click();
    await expect(page.getByTestId('jotai-count')).toHaveText('Jotai count: 2');
  });

  test('supports cookie context, private files, middleware modules, and custom api', async ({
    request,
  }) => {
    const first = await request.get(`http://localhost:${port}/cookie`);
    expect(first.headers()['x-minimal-middleware']).toBe('enabled');
    expect(first.headers()['set-cookie']).toContain('count=1');
    const firstHtml = await first.text();
    expect(firstHtml).toMatch(/Cookie count:\s*(<!-- -->)?1/);
    expect(firstHtml).toMatch(/Item count:\s*(<!-- -->)?3/);

    const second = await request.get(`http://localhost:${port}/cookie`, {
      headers: { cookie: 'count=1' },
    });
    expect(await second.text()).toMatch(/Cookie count:\s*(<!-- -->)?2/);

    const api = await request.get(`http://localhost:${port}/api/hello`);
    expect(await api.text()).toBe('world');
  });
});
