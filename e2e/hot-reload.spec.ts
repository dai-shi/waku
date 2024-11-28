import { expect } from '@playwright/test';
import { execSync, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import waitPort from 'wait-port';

import { debugChildProcess, getFreePort, terminate, test } from './utils.js';

let standaloneDir: string;
const fixtureDir = fileURLToPath(
  new URL('./fixtures/hot-reload', import.meta.url),
);
const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));
const { version } = createRequire(import.meta.url)(
  join(wakuDir, 'package.json'),
);

async function run() {
  const port = await getFreePort();
  const cp = exec(
    `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} dev --port ${port}`,
    { cwd: standaloneDir },
  );
  debugChildProcess(cp, fileURLToPath(import.meta.url), [
    /ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time/,
  ]);
  await waitPort({ port });
  return [port, cp.pid] as const;
}

async function modifyFile(file: string, search: string, replace: string) {
  const content = await readFile(join(standaloneDir, file), 'utf-8');
  await writeFile(join(standaloneDir, file), content.replace(search, replace));
}

test.describe('hot reload', () => {
  test.beforeEach(async () => {
    // GitHub Action on Windows doesn't support mkdtemp on global temp dir,
    // Which will cause files in `src` folder to be empty.
    // I don't know why
    const tmpDir = process.env.TEMP_DIR ? process.env.TEMP_DIR : tmpdir();
    standaloneDir = await mkdtemp(join(tmpDir, 'waku-hot-reload-'));
    await cp(fixtureDir, standaloneDir, {
      filter: (src) => {
        return !src.includes('node_modules') && !src.includes('dist');
      },
      recursive: true,
    });
    execSync(`pnpm pack --pack-destination ${standaloneDir}`, {
      cwd: wakuDir,
      stdio: 'inherit',
    });
    const name = `waku-${version}.tgz`;
    execSync(`npm install --force ${join(standaloneDir, name)}`, {
      cwd: standaloneDir,
      stdio: 'inherit',
    });
  });

  test('simple case', async ({ page }) => {
    const [port, pid] = await run();
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByText('Home Page')).toBeVisible();
    await expect(page.getByTestId('count')).toHaveText('0');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('1');
    await modifyFile('src/pages/index.tsx', 'Home Page', 'Modified Page');
    await page.waitForTimeout(100);
    await expect(page.getByText('Home Page')).toBeHidden();
    await expect(page.getByText('Modified Page')).toBeVisible();
    await expect(page.getByTestId('count')).toHaveText('1');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('2');
    await modifyFile('src/components/counter.tsx', 'Increment', 'Plus One');
    await page.waitForTimeout(100);
    await expect(page.getByText('Increment')).toBeHidden();
    await expect(page.getByText('Plus One')).toBeVisible();
    await expect(page.getByTestId('count')).toHaveText('2');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('3');
    await terminate(pid!);
  });
});
