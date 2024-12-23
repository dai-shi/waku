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

const cwd = fileURLToPath(new URL('./fixtures/create-pages', import.meta.url));

for (const { build, command } of commands) {
  test.describe(`create-pages: ${command}`, () => {
    let cp: ChildProcess;
    let port: number;

    test.beforeAll(async () => {
      await rm(`${cwd}/dist`, { recursive: true, force: true });
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

    test('home', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();
      const backgroundColor = await page.evaluate(() =>
        window
          .getComputedStyle(document.body)
          .getPropertyValue('background-color'),
      );
      expect(backgroundColor).toBe('rgb(254, 254, 254)');
    });

    test('foo', async ({ page }) => {
      await page.goto(`http://localhost:${port}`);
      await page.click("a[href='/foo']");
      await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();

      await page.goto(`http://localhost:${port}/foo`);
      await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
    });

    test('nested/foo', async ({ page }) => {
      // /nested/foo is defined as a staticPath of /nested/[id] which matches this layout
      await page.goto(`http://localhost:${port}/nested/foo`);
      await expect(
        page.getByRole('heading', { name: 'Deeply Nested Layout' }),
      ).toBeVisible();
    });

    test('wild/hello/world', async ({ page }) => {
      await page.goto(`http://localhost:${port}/wild/hello/world`);
      await expect(
        page.getByRole('heading', { name: 'Slug: hello/world' }),
      ).toBeVisible();
    });

    test('nested/baz', async ({ page }) => {
      await page.goto(`http://localhost:${port}/nested/baz`);
      await expect(
        page.getByRole('heading', { name: 'Nested Layout' }),
      ).toBeVisible();
    });

    test('jump', async ({ page }) => {
      // TODO move this to new standalone test
      await page.goto(`http://localhost:${port}`);
      await page.click("a[href='/foo']");
      await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
      await page.click('text=Jump to random page');
      await page.waitForTimeout(500); // need to wait not to error
      await expect(page.getByRole('heading', { level: 2 })).toBeVisible();
    });
  });
}
