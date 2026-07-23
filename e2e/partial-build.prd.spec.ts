import { rmSync, statSync } from 'fs';
import { ChildProcess, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { error, info } from '@actions/core';
import { expect } from '@playwright/test';
import {
  getAvailablePort,
  ignoreErrors,
  runShell,
  terminate,
  test,
  waitForPortReady,
} from './utils.js';

const execAsync = promisify(exec);

const cwd = fileURLToPath(new URL('./fixtures/partial-build', import.meta.url));

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

test.describe(`partial builds`, () => {
  let port: number;
  let cp: ChildProcess;

  test.beforeEach(async ({ page }) => {
    rmSync(`${cwd}/dist`, { recursive: true, force: true });
    await execAsync(`node ${waku} build`, {
      cwd,
      env: { ...process.env, PAGES: 'a' },
    });
    port = await getAvailablePort();
    cp = runShell(`node ${waku} start -p ${port}`, cwd);
    cp.stdout?.on('data', (data) => {
      if (ignoreErrors.some((re) => re.test(`${data}`))) {
        return;
      }
      info(`stdout: ${data}`);
      console.log(`stdout: `, `${data}`);
    });
    cp.stderr?.on('data', (data) => {
      if (ignoreErrors.some((re) => re.test(`${data}`))) {
        return;
      }
      error(`stderr: ${data}`);
      console.error(`stderr: `, `${data}`);
    });
    await waitForPortReady(port);
    await page.goto(`http://localhost:${port}/page/a`);
    await expect(page.getByTestId('title')).toHaveText('a');
  });

  test.afterEach(async () => {
    await terminate(cp);
  });

  test('does not change pages that already exist', async () => {
    const htmlBefore = statSync(`${cwd}/dist/public/page/a/index.html`);
    const rscBefore = statSync(`${cwd}/dist/public/RSC/R/page/a.txt`);
    const renderBefore = statSync(`${cwd}/dist/e2e/render/a.txt`);
    await execAsync(`node ${waku} build`, {
      cwd,
      env: { ...process.env, PAGES: 'a,b', ONLY_BUILD: '/page/b' },
    });
    const htmlAfter = statSync(`${cwd}/dist/public/page/a/index.html`);
    const rscAfter = statSync(`${cwd}/dist/public/RSC/R/page/a.txt`);
    const renderAfter = statSync(`${cwd}/dist/e2e/render/a.txt`);
    expect(htmlBefore.mtimeMs).toBe(htmlAfter.mtimeMs);
    expect(rscBefore.mtimeMs).toBe(rscAfter.mtimeMs);
    expect(renderBefore.mtimeMs).toBe(renderAfter.mtimeMs);
  });

  test('adds new pages', async ({ page }) => {
    await execAsync(`node ${waku} build`, {
      cwd,
      env: { ...process.env, PAGES: 'a,b' },
    });
    await page.goto(`http://localhost:${port}/page/b`);
    await expect(page.getByTestId('title')).toHaveText('b');
  });

  test('does not delete old pages', async ({ page }) => {
    await execAsync(`node ${waku} build`, {
      cwd,
      env: { ...process.env, PAGES: 'c' },
    });
    await page.goto(`http://localhost:${port}/page/a`);
    await expect(page.getByTestId('title')).toHaveText('a');
    await page.goto(`http://localhost:${port}/page/c`);
    await expect(page.getByTestId('title')).toHaveText('c');
  });
});
