import { expect } from '@playwright/test';
import { execSync, exec, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import waitPort from 'wait-port';
import { rm } from 'node:fs/promises';
import { test } from './utils.js';

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

const cwd = fileURLToPath(new URL('./fixtures/ssr-basic', import.meta.url));

for (const { build, command } of commands) {
  test.describe(`rsc-basic: ${command}`, () => {
    let cp: ChildProcess;
    let port: number;
    test.beforeAll(async () => {
      if (build) {
        execSync(`node ${waku} ${build}`, {
          cwd,
        });
      }
      port = Math.floor(Math.random() * 10000) + 10000;
      console.log(`node ${waku} ${command}`);
      console.log('cwd: ', cwd);
      cp = exec(`node ${waku} ${command}`, {
        cwd,
        env: {
          ...process.env,
          PORT: `${port}`,
        },
      });
      cp.on('message', (message) => {
        console.log('cp message: ', message);
      });
      await waitPort({
        port,
      });
    });

    test.afterAll(async () => {
      await rm(`${cwd}/dist`, {
        recursive: true,
        force: true,
      });
      cp.kill();
    });

    test('increase counter', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);

      await expect(page.getByTestId('app-name')).toHaveText('Waku');

      await expect(page.getByTestId('count')).toHaveText('0');
      await page.getByTestId('increment').click();
      await page.getByTestId('increment').click();
      await page.getByTestId('increment').click();
      await expect(page.getByTestId('count')).toHaveText('3');
    });

    const noJSTest = test.extend({});
    noJSTest.use({
      javaScriptEnabled: true,
    });

    noJSTest('no js environment should have first screen', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('app-name')).toHaveText('Waku');
      await expect(page.getByTestId('count')).toHaveText('0');
      await page.getByTestId('increment').click();
      await expect(page.getByTestId('count')).toHaveText('0');
    });
  });
}
