import { debugChildProcess, getFreePort, terminate, test } from './utils.js';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { exec, execSync } from 'node:child_process';
import { expect, type Page } from '@playwright/test';
import waitPort from 'wait-port';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

let standaloneDir: string;
const exampleDir = fileURLToPath(
  new URL('../examples/07_router', import.meta.url),
);
const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));

async function testRouterExample(page: Page, port: number) {
  await waitPort({
    port,
  });

  await page.goto(`http://localhost:${port}`);
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

  await page.click("a[href='/foo']");

  await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();

  await page.goto(`http://localhost:${port}/foo`);
  await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
}

test.describe('07_router standalone', () => {
  test.beforeAll('copy code', async () => {
    standaloneDir = await mkdtemp(join(tmpdir(), 'waku-07_counter'));
    await cp(exampleDir, standaloneDir, {
      filter: (src) => {
        return !src.includes('node_modules') && !src.includes('dist');
      },
      recursive: true,
    });
    execSync('npm install', {
      cwd: standaloneDir,
      stdio: 'inherit',
    });
    await rm(`${standaloneDir}/node_modules/waku`, {
      recursive: true,
      force: true,
    });
    // copy waku
    await cp(wakuDir, `${standaloneDir}/node_modules/waku`, {
      recursive: true,
    });
  });

  test('should prod work', async ({ page }) => {
    execSync(`node ${join('./node_modules/waku/dist/cli.js')} build`, {
      cwd: standaloneDir,
      stdio: 'inherit',
    });
    const port = await getFreePort();
    const cp = exec(`node ${join('./node_modules/waku/dist/cli.js')} start`, {
      cwd: standaloneDir,
      env: {
        ...process.env,
        PORT: `${port}`,
      },
    });
    debugChildProcess(cp, fileURLToPath(import.meta.url));
    await testRouterExample(page, port);
    await terminate(cp.pid!);
  });

  test('should dev work', async ({ page }) => {
    const port = await getFreePort();
    const cp = exec(`node ${join('./node_modules/waku/dist/cli.js')} dev`, {
      cwd: standaloneDir,
      env: {
        ...process.env,
        PORT: `${port}`,
      },
    });
    debugChildProcess(cp, fileURLToPath(import.meta.url));
    await testRouterExample(page, port);
    await terminate(cp.pid!);
  });
});
