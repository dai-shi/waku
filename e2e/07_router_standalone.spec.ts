import { debugChildProcess, getFreePort, terminate, test } from './utils.js';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { cp, mkdir, mkdtemp } from 'node:fs/promises';
import { execSync, execFileSync, execFile } from 'node:child_process';
import { expect, type Page } from '@playwright/test';
import waitPort from 'wait-port';
import { join, basename } from 'node:path';

const testConfig = {
  standaloneDir: '',
  get cliPath() {
    const isWin = process.platform === 'win32';
    return join(
      testConfig.standaloneDir,
      'node_modules',
      '.bin',
      `waku${isWin ? '.cmd' : ''}`,
    );
  },
};
const testResultDir = fileURLToPath(
  new URL('../test-results', import.meta.url),
);
const exampleDir = fileURLToPath(
  new URL('../examples/07_router', import.meta.url),
);
const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));

async function testRouterExample(page: Page, port: number) {
  await waitPort({
    port,
  });

  await page.goto(`http://localhost:${port}`);
  await page.waitForSelector('#waku-module-spinner', { state: 'detached' });
  await expect(page.getByRole('heading', { name: 'Home' })).toBeVisible();

  await page.click("a[href='/foo']");

  await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();

  await page.goto(`http://localhost:${port}/foo`);
  await expect(page.getByRole('heading', { name: 'Foo' })).toBeVisible();
}

test.describe('07_router standalone', () => {
  test.beforeEach(
    'setup standalone',
    async (
      // eslint-disable-next-line no-empty-pattern
      {},
      testInfo,
    ) => {
      testConfig.standaloneDir = await mkdtemp(
        join(tmpdir(), 'waku-07_counter'),
      );
      console.log(`run ${testInfo.title} in ${testConfig.standaloneDir}`);
      await cp(exampleDir, testConfig.standaloneDir, {
        filter(src) {
          if (src.includes('node_modules')) {
            return false;
          } else if (src.includes('dist')) {
            return false;
          }
          return true;
        },
        recursive: true,
      });
      execSync('npm install', {
        cwd: testConfig.standaloneDir,
        stdio: 'inherit',
      });
      // package waku
      const filePath = execSync(
        `pnpm pack --pack-destination ${testConfig.standaloneDir}`,
        {
          cwd: wakuDir,
          encoding: 'utf-8',
        },
      );
      // install waku
      execSync(`npm install ${filePath}`, {
        cwd: testConfig.standaloneDir,
        stdio: 'inherit',
      });
    },
  );

  test.afterEach(
    async (
      // eslint-disable-next-line no-empty-pattern
      {},
      testInfo,
    ) => {
      if (testInfo.status !== testInfo.expectedStatus) {
        // copy dist, src, package.json, tsconfig.json
        const output = join(testResultDir, basename(testConfig.standaloneDir));
        await mkdir(output);
        await cp(testConfig.standaloneDir, output, {
          filter(src) {
            if (src.includes('node_modules')) {
              return false;
            }
            return true;
          },
          recursive: true,
        });
        execSync(`pnpm pack --pack-destination ${testResultDir}`, {
          cwd: wakuDir,
          encoding: 'utf-8',
        });
      }
    },
  );

  test('should prod work', async ({ page }) => {
    execFileSync(testConfig.cliPath, ['build'], {
      cwd: testConfig.standaloneDir,
      stdio: 'inherit',
    });
    const port = await getFreePort();
    const cp = execFile(testConfig.cliPath, ['start'], {
      cwd: testConfig.standaloneDir,
      env: {
        ...process.env,
        PORT: `${port}`,
      },
    });
    debugChildProcess(cp);
    await testRouterExample(page, port);
    await terminate(cp.pid!);
  });

  test('should dev work', async ({ page }) => {
    const port = await getFreePort();
    const cp = execFile(testConfig.cliPath, ['dev'], {
      cwd: testConfig.standaloneDir,
      env: {
        ...process.env,
        PORT: `${port}`,
      },
    });
    debugChildProcess(cp);
    await testRouterExample(page, port);
    await terminate(cp.pid!);
  });
});
