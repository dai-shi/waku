import { expect } from '@playwright/test';
import { execSync, exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import waitPort from 'wait-port';

import {
  debugChildProcess,
  getFreePort,
  isPortAvailable,
  terminate,
  test,
} from './utils.js';

let standaloneDir: string;
const fixtureDir = fileURLToPath(
  new URL('./fixtures/hot-reload', import.meta.url),
);
const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));
const { version } = createRequire(import.meta.url)(
  join(wakuDir, 'package.json'),
);

async function run() {
  const HMR_PORT = 24678;
  if (!(await isPortAvailable(HMR_PORT))) {
    if (process.platform === 'win32') {
      const output = execSync(
        `for /f "tokens=5" %A in ('netstat -ano ^| findstr :${HMR_PORT} ^| findstr LISTENING') do @echo %A`,
        {
          encoding: 'utf8',
        },
      );
      if (output) {
        await terminate(parseInt(output));
      }
    } else {
      const output = execSync(`lsof -i:${HMR_PORT} | awk 'NR==2 {print $2}'`, {
        encoding: 'utf8',
      });
      if (output) {
        await terminate(parseInt(output));
      }
    }
  }
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

  test('server and client', async ({ page }) => {
    const [port, pid] = await run();
    await page.goto(`http://localhost:${port}/`);
    await expect(page.getByText('Home Page')).toBeVisible();
    await expect(page.getByTestId('count')).toHaveText('0');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('1');
    // Server component hot reload
    await modifyFile('src/pages/index.tsx', 'Home Page', 'Modified Page');
    await expect(page.getByText('Modified Page')).toBeVisible();
    await page.waitForTimeout(500); // need to wait not to full reload
    await expect(page.getByTestId('count')).toHaveText('1');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('2');
    // Client component HMR
    await modifyFile('src/components/counter.tsx', 'Increment', 'Plus One');
    await expect(page.getByText('Plus One')).toBeVisible();
    await page.waitForTimeout(500); // need to wait not to full reload
    await expect(page.getByTestId('count')).toHaveText('2');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('3');
    // Server component hot reload again
    await modifyFile('src/pages/index.tsx', 'Modified Page', 'Edited Page');
    await expect(page.getByText('Edited Page')).toBeVisible();
    await page.waitForTimeout(500); // need to wait not to full reload
    await expect(page.getByTestId('count')).toHaveText('3');
    await page.getByTestId('increment').click();
    await expect(page.getByTestId('count')).toHaveText('4');
    // Jump to another page and back
    await page.getByTestId('about').click();
    await expect(page.getByText('About Page')).toBeVisible();
    await modifyFile('src/pages/about.tsx', 'About Page', 'About2 Page');
    await expect(page.getByText('About2 Page')).toBeVisible();
    await page.getByTestId('home').click();
    await expect(page.getByText('Edited Page')).toBeVisible();
    await terminate(pid!);
  });
});
