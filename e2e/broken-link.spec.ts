import { debugChildProcess, getFreePort, terminate, test } from './utils.js';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp } from 'node:fs/promises';
import { exec, execSync } from 'node:child_process';
import { expect } from '@playwright/test';
import waitPort from 'wait-port';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

let standaloneDir: string;
const exampleDir = fileURLToPath(
  new URL('./fixtures/broken-links', import.meta.url),
);
const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));
const { version } = createRequire(import.meta.url)(
  join(wakuDir, 'package.json'),
);

async function start(staticServe: boolean) {
  const port = await getFreePort();
  const cp = exec(
    staticServe
      ? `node ${join(standaloneDir, './node_modules/serve/build/main.js')} dist/public -p ${port}`
      : `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} start --port ${port}`,
    { cwd: standaloneDir },
  );
  debugChildProcess(cp, fileURLToPath(import.meta.url), [
    /ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time/,
  ]);

  await waitPort({ port });
  return [port, cp.pid] as const;
}

test.beforeEach(async () => {
  // GitHub Action on Windows doesn't support mkdtemp on global temp dir,
  // Which will cause files in `src` folder to be empty.
  // I don't know why
  const tmpDir = process.env.TEMP_DIR ? process.env.TEMP_DIR : tmpdir();
  standaloneDir = await mkdtemp(join(tmpDir, 'waku-broken-link-'));
  await cp(exampleDir, standaloneDir, {
    filter: (src) => {
      return !src.includes('node_modules') && !src.includes('dist');
    },
    recursive: true,
  });
  execSync(`pnpm pack --pack-destination ${standaloneDir}`, {
    cwd: wakuDir,
    stdio: 'inherit',
  });
  const name = `waku-${version}.tgz`;
  execSync(`npm install ${join(standaloneDir, name)}`, {
    cwd: standaloneDir,
    stdio: 'inherit',
  });
  execSync(
    `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} build`,
    {
      cwd: standaloneDir,
      stdio: 'inherit',
    },
  );
});

test.describe('server side navigation', () => {
  test('existing page', async ({ page }) => {
    const [port, pid] = await start(false);

    // Go to an existing page
    await page.goto(`http://localhost:${port}/exists`);
    // The page renders its header
    await expect(page.getByRole('heading')).toHaveText('Existing page');
    // The page URL is correct
    expect(page.url()).toBe(`http://localhost:${port}/exists`);

    // Go back to the index page
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('heading')).toHaveText('Index');

    await terminate(pid!);
  });

  test('missing page', async ({ page }) => {
    const [port, pid] = await start(false);

    // Navigate to a non-existing page
    await page.goto(`http://localhost:${port}/broken`);
    // The page renders the custom 404.tsx
    await expect(page.getByRole('heading')).toHaveText('Custom not found');
    // The browsers URL remains the one that was navigated to
    expect(page.url()).toBe(`http://localhost:${port}/broken`);

    // Go back to the index page
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('heading')).toHaveText('Index');

    await terminate(pid!);
  });

  test('redirect', async ({ page }) => {
    const [port, pid] = await start(false);

    // Navigate to a page that redirects to an existing page
    await page.goto(`http://localhost:${port}/redirect`);
    // The page renders the target page
    await expect(page.getByRole('heading')).toHaveText('Existing page');
    // The browsers URL is the one of the target page
    expect(page.url()).toBe(`http://localhost:${port}/exists`);

    // Go back to the index page
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('heading')).toHaveText('Index');

    await terminate(pid!);
  });

  test('broken redirect', async ({ page }) => {
    const [port, pid] = await start(false);

    // Navigate to a page that redirects to a non-existing page
    await page.goto(`http://localhost:${port}/broken-redirect`);
    // The page renders the custom 404.tsx
    await expect(page.getByRole('heading')).toHaveText('Custom not found');
    // The browsers URL remains the one that was redirected to
    expect(page.url()).toBe(`http://localhost:${port}/broken`);

    // Go back to the index page
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('heading')).toHaveText('Index');

    await terminate(pid!);
  });
});

test.describe('client side navigation', () => {
  test('correct link', async ({ page }) => {
    const [port, pid] = await start(true);

    await page.goto(`http://localhost:${port}`);
    // Click on a link to an existing page
    await page.getByRole('link', { name: 'Existing page' }).click();
    // The page renders the target page
    await expect(page.getByRole('heading')).toHaveText('Existing page');
    // The browsers URL is the one of the target page
    expect(page.url()).toBe(`http://localhost:${port}/exists`);

    // Go back to the index page
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('heading')).toHaveText('Index');

    await terminate(pid!);
  });

  test('broken link', async ({ page }) => {
    const [port, pid] = await start(true);

    await page.goto(`http://localhost:${port}`);

    // Click on a link to a non-existing page
    await page.getByRole('link', { name: 'Broken link' }).click();
    // The page renders the custom 404.tsx
    await expect(page.getByRole('heading')).toHaveText('Custom not found');
    // The browsers URL remains the one that was navigated to
    expect(page.url()).toBe(`http://localhost:${port}/broken`);

    // Go back to the index page
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('heading')).toHaveText('Index');

    await terminate(pid!);
  });

  test('redirect', async ({ page }) => {
    const [port, pid] = await start(true);
    await page.goto(`http://localhost:${port}`);

    // Click on a link to a redirect
    await page.getByRole('link', { name: 'Correct redirect' }).click();

    // The page renders the target page
    await expect(page.getByRole('heading')).toHaveText('Existing page');
    // The browsers URL is the one of the target page
    expect(page.url()).toBe(`http://localhost:${port}/exists`);

    // Go back to the index page
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('heading')).toHaveText('Index');

    await terminate(pid!);
  });

  test('broken redirect', async ({ page }) => {
    const [port, pid] = await start(true);
    await page.goto(`http://localhost:${port}`);

    // Click on a link to a broken redirect
    await page.getByRole('link', { name: 'Broken redirect' }).click();

    // The page renders the custom 404.tsx
    await expect(page.getByRole('heading')).toHaveText('Custom not found');
    // The browsers URL remains the link href
    // NOTE: This is inconsistent with server side navigation, but
    //       there is no way to tell where the RSC request was redirected
    //       to before failing with 404.
    expect(page.url()).toBe(`http://localhost:${port}/broken-redirect`);

    // Go back to the index page
    await page.getByRole('link', { name: 'Back' }).click();
    await expect(page.getByRole('heading')).toHaveText('Index');

    await terminate(pid!);
  });
});
