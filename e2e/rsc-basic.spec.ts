import { expect } from '@playwright/test';
import { execSync, exec, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import waitPort from 'wait-port';
import os from 'node:os';
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

const cwd = fileURLToPath(new URL('./fixtures/rsc-basic', import.meta.url));

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
      cp.kill();
    });

    test('basic', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);

      await expect(page.getByTestId('app-name')).toHaveText('Waku');

      await expect(
        page.getByTestId('client-counter').getByTestId('count'),
      ).toHaveText('0');
      await page.getByTestId('client-counter').getByTestId('increment').click();
      await expect(
        page.getByTestId('client-counter').getByTestId('count'),
      ).toHaveText('1');
      await page.getByTestId('client-counter').getByTestId('increment').click();
      await expect(
        page.getByTestId('client-counter').getByTestId('count'),
      ).toHaveText('2');

      if (os.platform() === 'win32') {
        // fixme: server action is not working on windows
        return;
      }
      await expect(
        page.getByTestId('server-ping').getByTestId('pong'),
      ).toBeEmpty();
      await page.getByTestId('server-ping').getByTestId('ping').click();
      await expect(
        page.getByTestId('server-ping').getByTestId('pong'),
      ).toHaveText('pong');
      await expect(
        page.getByTestId('server-ping').getByTestId('counter'),
      ).toHaveText('0');
      await page.getByTestId('server-ping').getByTestId('increase').click();
      await expect(
        page.getByTestId('server-ping').getByTestId('counter'),
      ).toHaveText('1');
      await page.getByTestId('server-ping').getByTestId('increase').click();
      await expect(
        page.getByTestId('server-ping').getByTestId('counter'),
      ).toHaveText('2');
    });
  });
}
