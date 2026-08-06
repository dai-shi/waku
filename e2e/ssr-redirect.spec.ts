import { createServer } from 'node:http';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect } from '@playwright/test';
import { prepareNormalSetup, test, waitForHydration } from './utils.js';

const startApp = prepareNormalSetup('ssr-redirect');

test.describe(`ssr-redirect`, () => {
  let port: number;
  let stopApp: () => Promise<void>;
  let otherOrigin: string;
  let other: Server;
  const hits: string[] = [];
  const serverOutput: string[] = [];

  test.beforeAll(async ({ mode }) => {
    // a second origin that sends no cors headers, which a fetch cannot read
    other = createServer((req, res) => {
      hits.push(`${req.method} ${req.headers.origin ?? 'none'} ${req.url}`);
      res.writeHead(200, { 'content-type': 'text/html' });
      res.end('<html><body><h1>Other Origin</h1></body></html>');
    });
    await new Promise<void>((resolve, reject) => {
      other.once('error', reject);
      other.listen(0, '127.0.0.1', resolve);
    });
    otherOrigin = `http://127.0.0.1:${(other.address() as AddressInfo).port}`;
    // an ephemeral port, so two projects running this spec cannot collide
    process.env.WAKU_E2E_EXTERNAL_ORIGIN = otherOrigin;
    ({ port, stopApp } = await startApp(mode, {
      onServerOutput: (data) => serverOutput.push(data),
    }));
  });

  test.beforeEach(() => {
    hits.length = 0;
  });

  test.afterAll(async () => {
    delete process.env.WAKU_E2E_EXTERNAL_ORIGIN;
    other.closeAllConnections();
    await new Promise<void>((resolve) => other.close(() => resolve()));
    await stopApp();
  });

  test('a server action can send the browser to another origin', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/external-action`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('External Action Page');
    await page.getByTestId('to').fill(`${otherOrigin}/landed`);
    await page.locator('text=Leave').click();
    await page.waitForURL(`${otherOrigin}/landed`);
    await expect(page.getByRole('heading')).toHaveText('Other Origin');
  });

  test('a render that redirects off the origin does not fetch it first', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.locator("a[href='/external-page']").click();
    await page.waitForURL(`${otherOrigin}/from-render`);
    await expect(page.getByRole('heading')).toHaveText('Other Origin');
    // only a fetch sends an origin, and it could not have read the answer
    expect(hits.filter((hit) => hit.endsWith(' /from-render'))).toEqual([
      'GET none /from-render',
    ]);
  });

  test('a no js form that leaves does not replay the post', async ({
    browser,
  }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    try {
      await page.goto(`http://localhost:${port}/external-action`);
      await page.getByTestId('to').fill(`${otherOrigin}/landed-nojs`);
      await page.locator('text=Leave').click();
      await page.waitForURL(`${otherOrigin}/landed-nojs`);
      await expect(page.getByRole('heading')).toHaveText('Other Origin');
      // a 307 would send the form body to the other site along with it
      expect(hits.filter((hit) => hit.endsWith(' /landed-nojs'))).toEqual([
        'GET none /landed-nojs',
      ]);
    } finally {
      await context.close();
    }
  });

  test('a redirect thrown after the stream opens still leaves', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await page.locator("a[href='/external-late']").click();
    await page.waitForURL(`${otherOrigin}/from-late`, { timeout: 10_000 });
    await expect(page.getByRole('heading')).toHaveText('Other Origin');
    expect(hits.filter((hit) => hit.endsWith(' /from-late'))).toEqual([
      'GET none /from-late',
    ]);
  });

  test('access sync page directly', async ({ page }) => {
    await page.goto(`http://localhost:${port}/sync`);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access async page directly', async ({ page }) => {
    await page.goto(`http://localhost:${port}/async`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access sync page with client navigation', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Home Page');
    await page.locator("a[href='/sync']").click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('access async page with client navigation', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Home Page');
    await page.locator("a[href='/async']").click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('navigation in server action', async ({ page }) => {
    await page.goto(`http://localhost:${port}/action`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Action Page');
    await page.locator('text=Redirect Action').click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
  });

  test('navigation in server action (no js)', async ({ browser }) => {
    const context = await browser.newContext({
      javaScriptEnabled: false,
    });
    const page = await context.newPage();
    await page.goto(`http://localhost:${port}/action`);
    await expect(page.getByRole('heading')).toHaveText('Action Page');
    await page.locator('text=Redirect Action').click();
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    await context.close();
  });

  test('redirect should not log "Error during rendering" to server console', async ({
    page,
  }) => {
    await page.goto(`http://localhost:${port}/async`);
    await waitForHydration(page);
    await expect(page.getByRole('heading')).toHaveText('Destination Page');
    const combined = serverOutput.join('');
    expect(combined).not.toContain('Error during rendering');
  });
});
