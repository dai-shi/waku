import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect } from '@playwright/test';
import { prepareStandaloneSetup, test } from './utils.js';

const startApp = prepareStandaloneSetup('fs-router-build-split');

const STATIC_RENDER_SENTINEL = 'ISSUE_1912_STATIC_ROUTE_RENDER_SENTINEL';
const DYNAMIC_RENDER_SENTINEL = 'ISSUE_1912_DYNAMIC_ROUTE_RENDER_SENTINEL';

const collectDistFiles = (dir: string): string[] => {
  const files: string[] = [];
  const queue = [dir];

  while (queue.length) {
    const current = queue.pop()!;
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const nextPath = join(current, entry.name);
      if (entry.isDirectory()) {
        queue.push(nextPath);
        continue;
      }
      files.push(nextPath);
    }
  }

  return files;
};

test.describe('fs-router build split', () => {
  let port: number;
  let standaloneDir: string;
  let stopApp: (() => Promise<void>) | undefined;

  test.beforeAll(async () => {
    ({ port, stopApp, standaloneDir } = await startApp('PRD'));
  });

  test.afterAll(async () => {
    if (stopApp) {
      await stopApp();
    }
  });

  test('runtime bundle excludes fully static routes while SSG still emits them', async ({
    page,
  }) => {
    const distDir = join(standaloneDir, 'dist');

    expect(existsSync(distDir)).toBe(true);

    await page.goto(`http://localhost:${port}/runtime-build-static`);
    await expect(
      page.getByRole('heading', { name: STATIC_RENDER_SENTINEL }),
    ).toBeVisible();

    await page.goto(`http://localhost:${port}/runtime-build-dynamic`);
    await expect(
      page.getByRole('heading', { name: DYNAMIC_RENDER_SENTINEL }),
    ).toBeVisible();

    const serverDistFiles = collectDistFiles(join(distDir, 'server'));
    const serverJsContents = serverDistFiles
      .filter((file) => file.endsWith('.js'))
      .map((file) => readFileSync(file, 'utf8'));

    expect(
      serverJsContents.some((content) =>
        content.includes(STATIC_RENDER_SENTINEL),
      ),
    ).toBe(false);

    // Assets emitted for a fully-static route (CSS, fonts, wasm, ...) should
    // also be pruned from dist/server, not just the JS chunks.
    const serverCssContents = serverDistFiles
      .filter((file) => file.endsWith('.css'))
      .map((file) => readFileSync(file, 'utf8'));
    expect(
      serverCssContents.some((content) =>
        content.includes('issue-1912-static-only-css'),
      ),
    ).toBe(false);
  });
});
