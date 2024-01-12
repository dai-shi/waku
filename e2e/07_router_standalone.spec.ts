import { debugChildProcess, getFreePort, test } from './utils.js';
import { fileURLToPath } from 'node:url';
import { cp, mkdir, rm } from 'node:fs/promises';
import { exec, execSync } from 'node:child_process';
import { expect, type Page } from '@playwright/test';
import crypto from 'node:crypto';
import waitPort from 'wait-port';
import path from 'node:path';

const cacheDir = fileURLToPath(new URL('./.cache', import.meta.url));
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
  const dirname = crypto.randomUUID();
  test.beforeAll('copy code', async () => {
    await mkdir(cacheDir, {
      recursive: true,
    });
    await cp(exampleDir, `${cacheDir}/${dirname}`, { recursive: true });
    // cleanup node_modules and output
    await rm(`${cacheDir}/${dirname}/node_modules`, {
      recursive: true,
      force: true,
    });
    await rm(`${cacheDir}/${dirname}/dist`, { recursive: true, force: true });
    execSync('pnpm --ignore-workspace install', {
      cwd: `${cacheDir}/${dirname}`,
      stdio: 'inherit',
    });
    await rm(`${cacheDir}/${dirname}/node_modules/waku`, {
      recursive: true,
      force: true,
    });
    // copy waku
    await cp(wakuDir, `${cacheDir}/${dirname}/node_modules/waku`, {
      recursive: true,
    });
    execSync('pnpm --ignore-workspace install --prod', {
      cwd: `${cacheDir}/${dirname}/node_modules/waku`,
      stdio: 'inherit',
    });
  });

  test('should prod work', async ({ page }) => {
    execSync(`node ${path.join('./node_modules/waku/dist/cli.js')} build`, {
      cwd: `${cacheDir}/${dirname}`,
      stdio: 'inherit',
    });
    const port = await getFreePort();
    const cp = exec(
      `node ${path.join('./node_modules/waku/dist/cli.js')} start`,
      {
        cwd: `${cacheDir}/${dirname}`,
        env: {
          ...process.env,
          PORT: `${port}`,
        },
      },
    );
    debugChildProcess(cp);
    await testRouterExample(page, port);
    cp.kill();
  });

  test('should dev work', async ({ page }) => {
    const port = await getFreePort();
    const cp = exec(
      `node ${path.join('./node_modules/waku/dist/cli.js')} dev`,
      {
        cwd: `${cacheDir}/${dirname}`,
        env: {
          ...process.env,
          PORT: `${port}`,
        },
      },
    );
    debugChildProcess(cp);
    await testRouterExample(page, port);
    cp.kill();
  });
});
