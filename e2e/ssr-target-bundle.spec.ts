import { expect } from '@playwright/test';
import { execSync, exec, ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import waitPort from 'wait-port';
import { debugChildProcess, getFreePort, terminate, test } from './utils.js';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

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

    test('image exists in folder public/assets', async () => {
      test.skip(command.startsWith('dev'));
      const imagePath = path.join(cwd, 'dist', 'public', 'assets');
      const files = await readdir(imagePath);
      const imageExists = files.some((file) =>
        file.startsWith('image-not-inlined-'),
      );
      expect(imageExists).toBe(true);
    });

    test('json public linked exists in folder public/assets', async () => {
      test.skip(command.startsWith('dev'));
      const imagePath = path.join(cwd, 'dist', 'public', 'assets');
      const files = await readdir(imagePath);
      const imageExists = files.some((file) =>
        file.startsWith('json-public-linked-'),
      );
      expect(imageExists).toBe(true);
    });

    test('json private NOT exists in folder public/assets', async () => {
      test.skip(command.startsWith('dev'));
      const imagePath = path.join(cwd, 'dist', 'public', 'assets');
      const files = await readdir(imagePath);
      const imageExists = files.some((file) =>
        file.startsWith('json-private-'),
      );
      expect(imageExists).not.toBe(true);
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

    test('image was loaded and JSON results exists', async ({ page }) => {
      await page.goto(`http://localhost:${port}/`);
      await page.waitForLoadState('domcontentloaded');
      await expect(page.getByTestId('app-name')).toHaveText('Waku');
      page.on('response', (data) => {
        console.log(
          data.status(),
          data.url(),
          data.url() /*.includes('image.png')*/,
        );
      });
      await expect(page.getByTestId('image')).toHaveJSProperty(
        'complete',
        true,
      );
      await expect(page.getByTestId('image')).not.toHaveJSProperty(
        'naturalWidth',
        0,
      );
      await expect(page.getByTestId('json-private')).toHaveText('6');
      const value = await page
        .getByTestId('json-public-linked')
        .getAttribute('href');
      expect(value).toMatch(/json-public-linked/);
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
