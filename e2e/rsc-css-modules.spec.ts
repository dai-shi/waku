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

const cwd = fileURLToPath(
  new URL('./fixtures/rsc-css-modules', import.meta.url),
);

for (const { build, command } of commands) {
  test.describe(`rsc-css-modules: ${command}`, () => {
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
      debugChildProcess(cp, fileURLToPath(import.meta.url), [
        /ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time/,
      ]);
      await waitPort({ port });
    });

    test.afterAll(async () => {
      await terminate(cp.pid!);
    });

    test('css-modules classes', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);

      const wrapperClass = await page
        .getByTestId('app-wrapper')
        .getAttribute('class');
      expect(wrapperClass).toContain('wrapper');

      const appNameClass = await page
        .getByTestId('app-name')
        .getAttribute('class');
      expect(appNameClass).toContain('text');

      const clientcounterClass = await page
        .getByTestId('client-counter')
        .getAttribute('class');
      expect(clientcounterClass).toContain('counterWrapper');

      const incrementClass = await page
        .getByTestId('increment')
        .getAttribute('class');
      expect(incrementClass).toContain('counterButton');
    });
  });
}
