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
    command: 'dev --with-ssr',
  },
  {
    build: 'build',
    command: 'start',
  },
  {
    build: 'build --with-ssr',
    command: 'start --with-ssr',
  },
];

const cwd = fileURLToPath(new URL('./fixtures/waku-router', import.meta.url));

for (const { build, command } of commands) {
  test.describe(`waku-router: ${command}`, () => {
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

    for (const id of ['link-to-about', 'a-to-about']) {
      for (const secondId of ['link-to-home', 'a-to-home']) {
        test(`static router: click ${id} then ${secondId}`, async ({
          page,
        }) => {
          await page.goto(`http://localhost:${port}/`);
          await expect(page.getByTestId('current-url')).toHaveText('/');
          await page.getByTestId(id).click();
          await expect(
            page.getByTestId('current-url'),
            `should be on about page after clicking "${id}"`,
          ).toHaveText('/about');
          await page.getByTestId(secondId).click();
          await expect(
            page.getByTestId('current-url'),
            `should be back to home page after clicking "${secondId}"`,
          ).toHaveText('/');
        });
      }
    }
    for (const id of ['a-to-room', 'link-to-room']) {
      for (const secondId of ['a-to-home', 'link-to-home']) {
        test(`dynamic router: click ${id} then ${secondId}`, async ({
          page,
        }) => {
          await page.goto(`http://localhost:${port}/`);
          await expect(
            page.getByTestId('current-url'),
            'should be on home page',
          ).toHaveText('/');
          await page.getByTestId(id).click();
          await expect(
            page.getByTestId('current-url'),
            `should be on room page after clicking "${id}"`,
          ).toHaveText(/^\/[a-f0-9-]+$/);
          await page.getByTestId(secondId).click();
          await expect(
            page.getByTestId('current-url'),
            `should be back to home page after clicking "${secondId}`,
          ).toHaveText('/');
        });
      }
    }
  });
}
