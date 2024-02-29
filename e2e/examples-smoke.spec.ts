/**
 * Smoke tests for all examples.
 * This test will run all examples and check that the title is correct.
 *
 * If you want to run a specific example, you can use VSCode Playwright extension.
 */
import { expect } from '@playwright/test';
import { execSync, exec, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import waitPort from 'wait-port';
import { readdir, rm } from 'node:fs/promises';
import { basename } from 'node:path';
import { debugChildProcess, getFreePort, terminate, test } from './utils.js';
import { error, info } from '@actions/core';

const examplesDir = fileURLToPath(new URL('../examples', import.meta.url));

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

const specialExamples = [
  {
    name: '08_cookies',
    commands: [
      {
        command: 'node dev.js --with-ssr',
      },
      {
        command: 'node dev.js',
      },
      {
        build: 'waku build --with-ssr',
        command: 'node start.js --with-ssr',
      },
      {
        build: 'waku build',
        command: 'node start.js',
      },
    ],
  },
];

const examples = [
  ...(await readdir(examplesDir)).map((example) =>
    fileURLToPath(new URL(`../examples/${example}`, import.meta.url)),
  ),
];

for (const cwd of examples) {
  const specialExample = specialExamples.find(({ name }) => cwd.includes(name));
  if (specialExample) {
    for (const { build, command } of specialExample.commands) {
      test.describe(`smoke test on ${basename(cwd)}: ${command}`, () => {
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
            execSync(build, {
              cwd,
              env: process.env,
            });
          }
          port = await getFreePort();
          cp = exec(command, {
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

        test('check title', async ({ page }) => {
          await page.goto(`http://localhost:${port}/`);
          // title maybe doesn't ready yet
          await page.waitForLoadState('load');
          await expect.poll(() => page.title()).toMatch(/^Waku/);
        });
      });
    }
  } else {
    for (const { build, command } of commands) {
      test.describe(`smoke test on ${basename(cwd)}: ${command}`, () => {
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
            info(`${port} stdout: ${data}`);
            console.log(`${port} stdout: `, `${data}`);
          });
          cp.stderr?.on('data', (data) => {
            error(`${port} stderr: ${data}`);
            console.error(`${port} stderr: `, `${data}`);
          });
          await waitPort({
            port,
          });
        });

        test.afterAll(async () => {
          await terminate(cp.pid!);
        });

        test('check title', async ({ page }) => {
          await page.goto(`http://localhost:${port}/`);
          // title maybe doesn't ready yet
          await page.waitForLoadState('load');
          await expect.poll(() => page.title()).toMatch(/^Waku/);
        });
      });
    }
  }
}
