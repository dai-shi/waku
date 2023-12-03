import { expect } from '@playwright/test';
import { execSync, exec, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import waitPort from 'wait-port';
import { readdir } from 'node:fs/promises';
import { basename } from 'node:path';
import { getFreePort, test } from './utils.js';

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
