import { debugChildProcess, getFreePort, terminate, test } from './utils.js';
import { fileURLToPath } from 'node:url';
import { cp, mkdtemp } from 'node:fs/promises';
import { exec, execSync } from 'node:child_process';
import { expect } from '@playwright/test';
import waitPort from 'wait-port';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';

let standaloneDir: string;
let standaloneAppDir: string;
const appRelativePath = '/packages/waku-project';
const exampleDir = fileURLToPath(
  new URL('./fixtures/monorepo', import.meta.url),
);
const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));
const { version } = createRequire(import.meta.url)(
  join(wakuDir, 'package.json'),
);

async function start() {
  const port = await getFreePort();
  const cp = exec(
    `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} start --port ${port}`,
    { cwd: standaloneDir },
  );
  debugChildProcess(cp, fileURLToPath(import.meta.url), [
    /ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time/,
  ]);

  await waitPort({ port });
  return [port, cp.pid] as const;
}

test.describe('monorepo', async () => {
  test.beforeEach(async () => {
    // GitHub Action on Windows doesn't support mkdtemp on global temp dir,
    // Which will cause files in `src` folder to be empty.
    // I don't know why
    const tmpDir = process.env.TEMP_DIR ? process.env.TEMP_DIR : tmpdir();
    standaloneDir = await mkdtemp(join(tmpDir, 'waku-monorepo-'));
    standaloneAppDir = join(standaloneDir, appRelativePath);
    await cp(exampleDir, standaloneDir, {
      filter: (src) => {
        return !src.includes('node_modules') && !src.includes('dist');
      },
      recursive: true,
    });

    // FIXME we need to `npm install` in the monorepo but
    // how do we copy in the local version of waku or link
    // it in a way that will accurately match what happens
    // with the npm published version.
    execSync(`pnpm pack --pack-destination ${standaloneDir}`, {
      cwd: wakuDir,
      stdio: 'inherit',
    });
    const name = `waku-${version}.tgz`;
    execSync(`npm install ${join(standaloneDir, name)}`, {
      cwd: standaloneDir,
      stdio: 'inherit',
    });
    execSync(
      `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} build`,
      {
        cwd: standaloneAppDir,
        stdio: 'inherit',
      },
    );
  });

  test.describe('renders', () => {
    test(`the home page`, async ({ page }) => {
      const [port, pid] = await start();
      await page.goto(`http://localhost:${port}`);
      await expect(page.getByTestId('header')).toHaveText('Waku');
      await terminate(pid!);
    });
  });
});
