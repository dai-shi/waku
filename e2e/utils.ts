import { exec, spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { createConnection, createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { error, info } from '@actions/core';
import { test as basicTest, expect } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';

const execAsync = promisify(exec);

export const FETCH_ERROR_MESSAGES = {
  chromium: 'Failed to fetch',
  firefox: 'NetworkError when attempting to fetch resource.',
  webkit: 'Load failed',
};

const EXEC_TIMEOUT_MS = process.env.CI ? 120_000 : undefined;

export type TestOptions = {
  mode: 'DEV' | 'PRD';
  page: Page;
};

export const getAvailablePort = async (): Promise<number> => {
  // Start above 10080 to avoid browser-unsafe ports (e.g. 6665-6669, 10080)
  // that Chromium/Firefox refuse to connect to with ERR_UNSAFE_PORT.
  const MIN_PORT = 10100;
  const MAX_PORT = 60000;
  const port = MIN_PORT + Math.floor(Math.random() * (MAX_PORT - MIN_PORT));
  return new Promise((resolve) => {
    const server = createServer();
    server.unref();
    server.on('error', () => {
      server.close(() => resolve(getAvailablePort()));
    });
    server.listen(port, () => {
      server.close(() => resolve(port));
    });
  });
};

const PORT_WAIT_TIMEOUT_MS = 30_000;

export const waitForPortReady = async (port: number): Promise<void> =>
  new Promise((resolve, reject) => {
    const start = Date.now();
    const tryConnect = () => {
      const socket = createConnection(port);
      socket.once('connect', () => {
        socket.end();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();
        if (Date.now() - start >= PORT_WAIT_TIMEOUT_MS) {
          reject(new Error(`Timeout while waiting for port ${port}`));
          return;
        }
        setTimeout(tryConnect, 200);
      });
    };
    tryConnect();
  });

export const runShell = (command: string, cwd: string): ChildProcess =>
  spawn(command, {
    cwd,
    shell: true,
    detached: process.platform !== 'win32',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

export const terminate = async (cp: ChildProcess): Promise<void> => {
  if (cp.exitCode !== null) {
    return;
  }
  if (process.platform === 'win32') {
    await execAsync(`taskkill /pid ${cp.pid} /t /f`);
  } else if (cp.pid) {
    process.kill(-cp.pid, 'SIGTERM');
  }
};

const unexpectedErrors: RegExp[] = [
  /^You did not run Node.js with the `--conditions react-server` flag/,
  /^\(node:14372\)/,
  /^Warning: Expected server HTML to contain a matching/,
];

export const ignoreErrors: RegExp[] = [
  /ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time/,
  /npm warn Unknown env config "verify-deps-before-run"\. This will stop working in the next major version of npm\./,
  /^(Error during rendering: )?Error: Unexpected error\s+at ThrowsComponent/,
  /^(Error during rendering: )?Error: Intentional render error\s+at ErrorRender/,
  /^Error: Input is required\b/,
  /^(Error during rendering: )?Error: 401 Unauthorized\s+at CheckIfAccessDenied/,
  /^(Error during rendering: )?Error: Not Found\s+at SyncPage/,
  /^(Error during rendering: )?Error: Not Found\s+at AsyncPage/,
  /^(Error during rendering: )?Error: Not Found\s+at info/,
  /^(Error during rendering: )?Error: Not Found\s+at createCustomError/,
  /^(Error during rendering: )?Error: Redirect\s+at info/,
  /^(Error during rendering: )?Error: Redirect\s+at createCustomError/,
  // FIXME Is this too general and miss meaningful errors?
  /^(Error during rendering: )?\[Error: An error occurred in the Server Components render\./,
  // XXX Is it okay to ignore this error?
  /^Error: pathname must start with basePath: \/favicon\.ico\s+at removeBase/,
];

export function debugChildProcess(cp: ChildProcess, sourceFile: string) {
  cp.stdout?.on('data', (data) => {
    const str = data.toString();
    expect(unexpectedErrors.some((re) => re.test(str))).toBeFalsy();
    if (ignoreErrors.some((re) => re.test(str))) {
      return;
    }
    info(`(${sourceFile}) stdout: ${str}`);
  });

  cp.stderr?.on('data', (data) => {
    const str = data.toString();
    expect(unexpectedErrors.some((re) => re.test(str))).toBeFalsy();
    if (ignoreErrors.some((re) => re.test(str))) {
      return;
    }
    error(`stderr: ${str}`, {
      title: 'Child Process Error',
      file: sourceFile,
    });
  });
}

export const test = basicTest.extend<
  Omit<TestOptions, 'mode'>,
  Pick<TestOptions, 'mode'>
>({
  mode: ['DEV', { option: true, scope: 'worker' }],
  page: async ({ page }, pageUse, testInfo) => {
    const callback = (msg: ConsoleMessage) => {
      if (unexpectedErrors.some((re) => re.test(msg.text()))) {
        throw new Error(msg.text());
      }
      console.log(`(${testInfo.title}) ${msg.type()}: ${msg.text()}`);
    };
    page.on('console', callback);
    await pageUse(page);
    page.off('console', callback);
  },
});

export const prepareNormalSetup = (fixtureName: string) => {
  const waku = fileURLToPath(
    new URL('../packages/waku/dist/cli.js', import.meta.url),
  );
  const fixtureDir = fileURLToPath(
    new URL('./fixtures/' + fixtureName, import.meta.url),
  );
  let built = false;
  let buildResult: { stdout: string; stderr: string } | undefined;
  const startApp = async (
    mode: 'DEV' | 'PRD' | 'STATIC',
    options?: {
      cmd?: string | undefined;
      portFlag?: string | undefined;
      onServerOutput?: (data: string) => void;
    },
  ) => {
    if (mode !== 'DEV' && !built) {
      rmSync(`${fixtureDir}/dist`, { recursive: true, force: true });
      buildResult = await execAsync(`node ${waku} build`, { cwd: fixtureDir });
      built = true;
    }
    let cmd: string;
    switch (mode) {
      case 'DEV':
        cmd = `node ${waku} dev`;
        break;
      case 'PRD':
        cmd = `node ${waku} start`;
        break;
      case 'STATIC':
        cmd = `pnpm serve dist/public`;
        break;
    }
    if (options?.cmd) {
      cmd = options.cmd;
    }
    const portFlag = options?.portFlag ?? '-p';
    const port = await getAvailablePort();
    const cp = runShell(`${cmd} ${portFlag} ${port}`, fixtureDir);
    debugChildProcess(cp, fileURLToPath(import.meta.url));
    if (options?.onServerOutput) {
      const callback = options.onServerOutput;
      cp.stdout?.on('data', (data) => callback(data.toString()));
      cp.stderr?.on('data', (data) => callback(data.toString()));
    }
    await waitForPortReady(port);
    const stopApp = async () => {
      await terminate(cp);
    };
    return { port, stopApp, fixtureDir, buildResult };
  };
  return startApp;
};

const PACKAGE_INSTALL = {
  npm: `npm install --force`,
  pnpm: `pnpm install`,
  yarn: `yarn install`,
} as const;

const patchMonorepoPackageJson = (standaloneDir: string) => {
  const packagesDir = join(standaloneDir, 'packages');
  if (!existsSync(packagesDir)) {
    return;
  }
  const rootPackageJson = JSON.parse(
    readFileSync(join(standaloneDir, 'package.json'), 'utf8'),
  );
  const reactVersion = rootPackageJson.dependencies.react;
  if (!reactVersion) {
    return;
  }
  for (const dir of readdirSync(packagesDir)) {
    const packageJsonFile = join(packagesDir, dir, 'package.json');
    if (!existsSync(packageJsonFile)) {
      continue;
    }
    let modified = false;
    const packageJson = JSON.parse(readFileSync(packageJsonFile, 'utf8'));
    for (const key of Object.keys(packageJson.dependencies || {})) {
      if (key.startsWith('react')) {
        if (packageJson.dependencies[key] !== reactVersion) {
          packageJson.dependencies[key] = reactVersion;
          modified = true;
        }
      }
    }
    if (modified) {
      writeFileSync(packageJsonFile, JSON.stringify(packageJson), 'utf8');
    }
  }
};

export const makeTempDir = (prefix: string): string => {
  // GitHub Action on Windows doesn't support mkdtemp on global temp dir,
  // Which will cause files in `src` folder to be empty. I don't know why
  const tmpDir = process.env.TEMP_DIR || tmpdir();
  return mkdtempSync(join(tmpDir, prefix));
};

export const prepareStandaloneSetup = (fixtureName: string) => {
  const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));
  const { version } = createRequire(import.meta.url)(
    join(wakuDir, 'package.json'),
  );
  const fixtureDir = fileURLToPath(
    new URL('./fixtures/' + fixtureName, import.meta.url),
  );
  const standaloneDirMap = new Map<'npm' | 'pnpm' | 'yarn', string>();
  const builtModeMap = new Map<'npm' | 'pnpm' | 'yarn', 'PRD' | 'STATIC'>();
  const startApp = async (
    mode: 'DEV' | 'PRD' | 'STATIC',
    packageManager: 'npm' | 'pnpm' | 'yarn' = 'pnpm',
    packageDir = '',
  ) => {
    const wakuPackageDir = (): string => {
      if (!standaloneDir) {
        throw new Error('standaloneDir is not set');
      }
      return packageManager !== 'pnpm'
        ? standaloneDir
        : join(standaloneDir, packageDir);
    };
    let standaloneDir = standaloneDirMap.get(packageManager);
    if (!standaloneDir) {
      standaloneDir = makeTempDir(fixtureName);
      standaloneDirMap.set(packageManager, standaloneDir);
      const copyLabel = `[e2e] copy fixture (${fixtureName})`;
      console.time(copyLabel);
      cpSync(fixtureDir, standaloneDir, {
        filter: (src) => {
          return !src.includes('node_modules') && !src.includes('dist');
        },
        recursive: true,
      });
      console.timeEnd(copyLabel);
      const packLabel = `[e2e] pack waku (${packageManager})`;
      console.time(packLabel);
      await execAsync(`pnpm pack --pack-destination ${standaloneDir}`, {
        cwd: wakuDir,
        timeout: EXEC_TIMEOUT_MS,
      });
      console.timeEnd(packLabel);
      const wakuPackageTgz = join(standaloneDir, `waku-${version}.tgz`);
      const rootPkg = JSON.parse(
        readFileSync(
          fileURLToPath(new URL('../package.json', import.meta.url)),
          'utf8',
        ),
      );
      const pnpmOverrides = {
        ...rootPkg.pnpm?.overrides,
        ...rootPkg.pnpmOverrides, // Do we need this?
        waku: `file:${wakuPackageTgz}`,
      };
      for (const file of readdirSync(standaloneDir, {
        encoding: 'utf8',
        recursive: true,
      })) {
        if (file.endsWith('package.json')) {
          const f = join(standaloneDir, file);
          const pkg = JSON.parse(readFileSync(f, 'utf8'));
          for (const deps of [pkg.dependencies, pkg.devDependencies]) {
            Object.keys(deps || {}).forEach((key) => {
              if (pnpmOverrides[key]) {
                deps[key] = pnpmOverrides[key];
              }
            });
          }
          if (file === 'package.json') {
            switch (packageManager) {
              case 'npm': {
                pkg.overrides = pnpmOverrides;
                break;
              }
              case 'pnpm': {
                pkg.pnpm = { overrides: pnpmOverrides };
                break;
              }
              case 'yarn': {
                pkg.resolutions = pnpmOverrides;
                break;
              }
            }
            if (packageManager === 'pnpm') {
              pkg.packageManager = rootPkg.packageManager;
            }
          }
          writeFileSync(f, JSON.stringify(pkg, null, 2), 'utf8');
        }
      }
      if (packageManager !== 'pnpm') {
        patchMonorepoPackageJson(standaloneDir);
      }
      const installLabel = `[e2e] install (${packageManager})`;
      console.time(installLabel);
      await execAsync(PACKAGE_INSTALL[packageManager], {
        cwd: standaloneDir,
        timeout: EXEC_TIMEOUT_MS,
      });
      console.timeEnd(installLabel);
    }
    const waku = join(wakuPackageDir(), './node_modules/waku/dist/cli.js');
    if (mode !== 'DEV' && builtModeMap.get(packageManager) !== mode) {
      rmSync(`${join(standaloneDir, packageDir, 'dist')}`, {
        recursive: true,
        force: true,
      });
      const buildLabel = `[e2e] build (${packageManager}, ${mode})`;
      console.time(buildLabel);
      await execAsync(`node ${waku} build`, {
        cwd: join(standaloneDir, packageDir),
        timeout: EXEC_TIMEOUT_MS,
      });
      console.timeEnd(buildLabel);
      builtModeMap.set(packageManager, mode);
    }
    let cmd: string;
    switch (mode) {
      case 'DEV':
        cmd = `node ${waku} dev`;
        break;
      case 'PRD':
        cmd = `node ${waku} start`;
        break;
      case 'STATIC':
        cmd = `node ${join(standaloneDir, './node_modules/serve/build/main.js')} dist/public`;
        break;
    }
    const port = await getAvailablePort();
    // Assuming all commands support -p for port
    const cp = runShell(`${cmd} -p ${port}`, join(standaloneDir, packageDir));
    debugChildProcess(cp, fileURLToPath(import.meta.url));
    await waitForPortReady(port);
    const stopApp = async () => {
      builtModeMap.delete(packageManager);
      await terminate(cp);
    };
    return { port, stopApp, standaloneDir };
  };
  return startApp;
};

export async function waitForHydration(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForFunction(
    () => {
      const el = document.querySelector('body');
      if (el) {
        const keys = Object.keys(el);
        return keys.some((key) => key.startsWith('__reactFiber'));
      }
    },
    null,
    { timeout: 20_000 },
  );
}

// In WebKit + react@experimental, locator-based assertions can hang while
// Playwright waits for navigation to settle. This polls DOM text directly.
export const waitForSelectorText = async (
  page: Page,
  selector: string,
  text: string,
) => {
  await expect
    .poll(
      async () =>
        page.evaluate(
          (selector) => document.querySelector(selector)?.textContent ?? null,
          selector,
        ),
      { timeout: 10_000 },
    )
    .toBe(text);
};
