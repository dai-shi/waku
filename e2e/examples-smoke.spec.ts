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
import { readdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { getFreePort, test } from './utils.js';
import os from 'node:os';

const examplesDir = fileURLToPath(new URL('../examples', import.meta.url));

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

const failureTests = [
  ['03_promise', 'start --with-ssr'],
  ['05_mutation', 'start'],
  ['05_mutation', 'start --with-ssr'],
  ['07_router', 'start --with-ssr'],
  ['10_dynamicroute', 'start --with-ssr'],
];

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

        test('check title', async ({ page }) => {
          await page.goto(`http://localhost:${port}/`);
          const title = await page.title();
          expect(title).toBe('Waku example');
        });
      });
    }
  } else {
    for (const { build, command } of commands) {
      test.describe(`smoke test on ${basename(cwd)}: ${command}`, () => {
        if (
          os.platform() === 'win32' &&
          failureTests.find(
            ([name, cmd]) => basename(cwd) === name && cmd === command,
          )
        ) {
          test.skip();
        }
        let cp: ChildProcess;
        let port: number;
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

        test('check title', async ({ page }) => {
          await page.goto(`http://localhost:${port}/`);
          const title = await page.title();
          expect(title).toBe('Waku example');
        });
      });
    }
  }
}
