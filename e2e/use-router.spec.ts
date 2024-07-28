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
  new URL('./fixtures/use-router', import.meta.url),
);
const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));
const { version } = createRequire(import.meta.url)(
  join(wakuDir, 'package.json'),
);

async function start() {
  const port = await getFreePort();
  const cp = exec(
    `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} start --port ${port}`,
    { cwd: standaloneDir },
  );
  debugChildProcess(cp, fileURLToPath(import.meta.url), [
    /ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time/,
  ]);

  await waitPort({ port });
  return [port, cp.pid];
}

test.describe('useRouter', async () => {
  test.beforeEach(async () => {
    // GitHub Action on Windows doesn't support mkdtemp on global temp dir,
    // Which will cause files in `src` folder to be empty.
    // I don't know why
    const tmpDir = process.env.TEMP_DIR ? process.env.TEMP_DIR : tmpdir();
    standaloneDir = await mkdtemp(join(tmpDir, 'waku-use-router-'));
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

  test.describe('returns the current path', () => {
    test(`on dynamic pages`, async ({ page }) => {
      const [port, pid] = await start();
      await page.goto(`http://localhost:${port}/dynamic`);
      await expect(
        page.getByRole('heading', { name: 'Dynamic' }),
      ).toBeVisible();
      await expect(page.getByTestId('path')).toHaveText('Path: /dynamic');

      await terminate(pid!);
    });
    test(`on static pages`, async ({ page }) => {
      const [port, pid] = await start();
      await page.goto(`http://localhost:${port}/static`);
      await expect(page.getByRole('heading', { name: 'Static' })).toBeVisible();
      await expect(page.getByTestId('path')).toHaveText('Path: /static');

      await terminate(pid!);
    });
  });

  test.describe('updates path on link navigation', () => {
    test(`on dynamic pages`, async ({ page }) => {
      const [port, pid] = await start();
      await page.goto(`http://localhost:${port}/dynamic`);
      await page.click('text=Go to static');
      await expect(page.getByRole('heading', { name: 'Static' })).toBeVisible();
      await expect(page.getByTestId('path')).toHaveText('Path: /static');
      await terminate(pid!);
    });
    test(`on static pages`, async ({ page }) => {
      const [port, pid] = await start();
      await page.goto(`http://localhost:${port}/static`);
      await page.click('text=Go to dynamic');
      await expect(
        page.getByRole('heading', { name: 'Dynamic' }),
      ).toBeVisible();
      await expect(page.getByTestId('path')).toHaveText('Path: /dynamic');
      await terminate(pid!);
    });
  });

  test.describe('retrieves query variables', () => {
    test(`on dynamic pages`, async ({ page }) => {
      const [port, pid] = await start();
      await page.goto(`http://localhost:${port}/dynamic?count=42`);
      await expect(page.getByTestId('query')).toHaveText('Query: 42');
      await terminate(pid!);
    });
    test(`on static pages`, async ({ page }) => {
      const [port, pid] = await start();
      await page.goto(`http://localhost:${port}/static?count=42`);
      await expect(page.getByTestId('query')).toHaveText('Query: 42');
      await terminate(pid!);
    });
  });

  test.describe('updates query variables', () => {
    test(`on dynamic pages`, async ({ page }) => {
      const [port, pid] = await start();
      await page.goto(`http://localhost:${port}/dynamic`);
      await page.click('text=Increment query');
      await expect(page.getByTestId('query')).toHaveText('Query: 1');
      await page.click('text=Increment query (push)');
      await expect(page.getByTestId('query')).toHaveText('Query: 2');
      await terminate(pid!);
    });
    test(`on static pages`, async ({ page }) => {
      const [port, pid] = await start();
      await page.goto(`http://localhost:${port}/static`);
      await page.click('text=Increment query');
      await expect(page.getByTestId('query')).toHaveText('Query: 1');
      await page.click('text=Increment query (push)');
      await expect(page.getByTestId('query')).toHaveText('Query: 2');
      await terminate(pid!);
    });
  });

  test.describe('retrieves hashes', () => {
    test(`on dynamic pages`, async ({ page }) => {
      const [port, pid] = await start();
      await page.goto(`http://localhost:${port}/dynamic#42`);
      await expect(page.getByTestId('hash')).toHaveText('Hash: 42');
      await terminate(pid!);
    });
    test(`on static pages`, async ({ page }) => {
      const [port, pid] = await start();
      await page.goto(`http://localhost:${port}/static#42`);
      await expect(page.getByTestId('hash')).toHaveText('Hash: 42');
      await terminate(pid!);
    });
  });

  test.describe('updates hashes', () => {
    test(`on dynamic pages`, async ({ page }) => {
      const [port, pid] = await start();
      await page.goto(`http://localhost:${port}/dynamic`);
      await page.click('text=Increment hash');
      await expect(page.getByTestId('hash')).toHaveText('Hash: 1');
      await page.click('text=Increment hash (push)');
      await expect(page.getByTestId('hash')).toHaveText('Hash: 2');
      await terminate(pid!);
    });
    test(`on static pages`, async ({ page }) => {
      const [port, pid] = await start();
      await page.goto(`http://localhost:${port}/static`);
      await page.click('text=Increment hash');
      await expect(page.getByTestId('hash')).toHaveText('Hash: 1');
      await page.click('text=Increment hash (push)');
      await expect(page.getByTestId('hash')).toHaveText('Hash: 2');
      await terminate(pid!);
    });
  });
});
