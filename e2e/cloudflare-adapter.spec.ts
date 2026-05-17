import { expect } from '@playwright/test';
import { prepareNormalSetup, test } from './utils.js';

const startApp = prepareNormalSetup('cloudflare-adapter');

// The cloudflare adapter behavior is browser-agnostic, so chromium is enough.
test.skip(({ browserName }) => browserName !== 'chromium');
// This spec runs `wrangler dev` against the built output, which requires the PRD build step.
test.skip(({ mode }) => mode !== 'PRD');

test.describe('cloudflare adapter', () => {
  let port: number;
  let stopApp: () => Promise<void>;
  let buildResult: { stdout: string; stderr: string } | undefined;

  test.beforeAll(async ({ mode }) => {
    ({ port, stopApp, buildResult } = await startApp(mode, {
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
  });

  test('build does not warn about Node.js imports in the ssr (worker) environment', () => {
    const output =
      (buildResult?.stdout ?? '') + '\n' + (buildResult?.stderr ?? '');
    expect(output).not.toMatch(
      /Unexpected Node\.js imports for environment "ssr"/,
    );
  });
});
