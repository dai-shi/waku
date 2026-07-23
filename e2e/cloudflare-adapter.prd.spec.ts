import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('cloudflare-adapter');

test.describe('cloudflare adapter', () => {
  let port: number;
  let stopApp: () => Promise<void>;
  let buildResult: { stdout: string; stderr: string } | undefined;

  test.beforeAll(async () => {
    ({ port, stopApp, buildResult } = await startApp('PRD', {
      cmd: 'npx wrangler dev',
      portFlag: '--port',
    }));
  });

  test.afterAll(async () => {
    await stopApp();
  });

  // https://github.com/wakujs/waku/issues/2083
  test('renders _root and _layout on dynamic pages', async ({ page }) => {
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByTestId('root-marker')).toHaveText('ROOT_MARKER');
    await expect(page.getByTestId('layout-marker')).toHaveText('LAYOUT_MARKER');
    await expect(page.getByTestId('page-marker')).toHaveText('PAGE_MARKER');
    await expect(page.getByTestId('cloudflare-env')).toHaveText('MAX_ITEMS=10');
  });

  test('build does not warn about Node.js imports in the ssr (worker) environment', () => {
    const output =
      (buildResult?.stdout ?? '') + '\n' + (buildResult?.stderr ?? '');
    expect(output).not.toMatch(
      /Unexpected Node\.js imports for environment "ssr"/,
    );
  });
});
