import { expect } from '@playwright/test';
import { execSync, exec, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import waitPort from 'wait-port';
import { getFreePort, test } from './utils.js';
import { rm } from 'node:fs/promises';

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

const commands = [
  {
    command: 'dev',
  },
  {
    build: 'build',
    command: 'start',
  },
];

const cwd = fileURLToPath(
  new URL('./fixtures/ssr-context-provider', import.meta.url),
);

for (const { build, command } of commands) {
  test.describe(`ssr-context-provider: ${command}`, () => {
    let cp: ChildProcess;
    let port: number;
    test.beforeAll('remove cache', async () => {
      await rm(`${cwd}/dist`, {
        recursive: true,
        force: true,
      });
    });

    test.beforeAll(async () => {
      if (build) {
        execSync(`node ${waku} ${build}`, {
          cwd,
        });
      }
      port = await getFreePort();
      cp = exec(`node ${waku} ${command}`, {
        cwd,
        env: {
          ...process.env,
          PORT: `${port}`,
        },
      });
      cp.stdout?.on('data', (data) => {
        console.log(`${port} stdout: `, `${data}`);
      });
      cp.stderr?.on('data', (data) => {
        console.error(`${port} stderr: `, `${data}`);
      });
      await waitPort({
        port,
      });
    });

    test.afterAll(async () => {
      cp.kill();
    });

    test('show context value', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await page.waitForSelector('[data-testid="mounted"]');
      await expect(page.getByTestId('value')).toHaveText('provider value');
    });

    test('no js environment', async ({ browser }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
      });
      const page = await context.newPage();
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('value')).toHaveText('provider value');
      await page.close();
      await context.close();
    });
  });
}
