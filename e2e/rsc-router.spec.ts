import { expect } from '@playwright/test';
import { execSync, exec, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import waitPort from 'wait-port';
import { debugChildProcess, getFreePort, terminate, test } from './utils.js';
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

const cwd = fileURLToPath(new URL('./fixtures/rsc-router', import.meta.url));

for (const { build, command } of commands) {
  test.describe(`rsc-router: ${command}`, () => {
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
      debugChildProcess(cp, fileURLToPath(import.meta.url));
      await waitPort({
        port,
      });
    });

    test.afterAll(async () => {
      await terminate(cp.pid!);
    });

    test('home', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await expect(page.getByTestId('home-title')).toHaveText('Home');
      await page.getByText('Foo').click();
      await expect(page.getByTestId('foo-title')).toHaveText('Foo');
    });

    test('foo', async ({ page }) => {
      await page.goto(`http://localhost:${port}/foo`);
      await expect(page.getByTestId('foo-title')).toHaveText('Foo');
    });
  });
}
