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
    command: 'dev --with-ssr',
  },
  {
    build: 'build --with-ssr',
    command: 'start --with-ssr',
  },
];

const cwd = fileURLToPath(
  new URL('./fixtures/ssr-target-bundle', import.meta.url),
);

for (const { build, command } of commands) {
  test.describe(`ssr-target-bundle: ${command}`, () => {
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

    test('add text input', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('app-name')).toHaveText('Waku');
      await expect(page.getByTestId('textarea')).toHaveValue('EMPTY');
      const height = await page
        .getByTestId('textarea')
        .evaluate((el) => el.clientHeight);
      await page.getByTestId('textarea').fill('Line1\nLine2\nLine3');
      const heightChanged = await page
        .getByTestId('textarea')
        .evaluate((el) => el.clientHeight);
      expect(heightChanged).toBeGreaterThan(height);
    });

    test('no js environment should have first screen', async ({ browser }) => {
      const context = await browser.newContext({
        javaScriptEnabled: false,
      });
      const page = await context.newPage();
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('app-name')).toHaveText('Waku');
      await expect(page.getByTestId('textarea')).toHaveValue('EMPTY');
      await page.close();
      await context.close();
    });
  });
}
