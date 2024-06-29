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
import { getFreePort, terminate, test } from './utils.js';
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
    build: 'build',
    command: 'start',
  },
];

const examples = [
  ...(await readdir(examplesDir)).map((example) =>
    fileURLToPath(new URL(`../examples/${example}`, import.meta.url)),
  ),
];

for (const cwd of examples) {
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
          execSync(`node ${waku} ${build}`, { cwd });
        }
        port = await getFreePort();
        cp = exec(`node ${waku} ${command} --port ${port}`, { cwd });
        cp.stdout?.on('data', (data) => {
          info(`${port} stdout: ${data}`);
          console.log(`${port} stdout: `, `${data}`);
        });
        cp.stderr?.on('data', (data) => {
          if (
            command === 'dev' &&
            /WebSocket server error: Port is already in use/.test(`${data}`)
          ) {
            // ignore this error
            return;
          }
          error(`${port} stderr: ${data}`);
          console.error(`${port} stderr: `, `${data}`);
        });
        await waitPort({ port });
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
