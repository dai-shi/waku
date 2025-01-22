import net from 'node:net';
import { execSync, exec } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { cpSync, rmSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { ChildProcess } from 'node:child_process';
import { expect, test as basicTest } from '@playwright/test';
import type { ConsoleMessage, Page } from '@playwright/test';
import { error, info } from '@actions/core';
import waitPort from 'wait-port';

// Upstream doesn't support ES module
//  Related: https://github.com/dwyl/terminate/pull/85
export const terminate = createRequire(import.meta.url)(
  // use terminate instead of cp.kill,
  //  because cp.kill will not kill the child process of the child process
  //  to avoid the zombie process
  'terminate/promise',
) as (pid: number) => Promise<void>;

const unexpectedErrors: RegExp[] = [
  /^You did not run Node.js with the `--conditions react-server` flag/,
  /^\(node:14372\)/,
  /^Warning: Expected server HTML to contain a matching/,
];

const ignoreErrors: RegExp[] = [
  /ExperimentalWarning: Custom ESM Loaders is an experimental feature and might change at any time/,
  /^Error: Unexpected error\s+at ThrowsComponent/,
  /^Error: Something unexpected happened\s+at ErrorRender/,
  /^Error: 401 Unauthorized\s+at CheckIfAccessDenied/,
  // FIXME Is this too general and miss meaningful errors?
  /^\[Error: An error occurred in the Server Components render./,
];

export async function getFreePort(): Promise<number> {
  return new Promise<number>((resolve) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => resolve(port));
    });
  });
}

export async function isPortAvailable(port: number): Promise<boolean> {
  return new Promise<boolean>((resolve, reject) => {
    const srv = net.createServer();
    srv.once('error', (err) => {
      if ((err as any).code === 'EADDRINUSE') {
        resolve(false);
      } else {
        reject(err);
      }
    });
    srv.once('listening', () => {
      srv.close();
      resolve(true);
    });
    srv.listen(port);
  });
}

export function debugChildProcess(cp: ChildProcess, sourceFile: string) {
  cp.stdout?.on('data', (data) => {
    const str = data.toString();
    expect(unexpectedErrors.some((re) => re.test(str))).toBeFalsy();
    if (ignoreErrors?.some((re) => re.test(str))) {
      return;
    }
    info(`stdout: ${str}`);
    console.log(`stdout: ${str}`);
  });

  cp.stderr?.on('data', (data) => {
    const str = data.toString();
    expect(unexpectedErrors.some((re) => re.test(str))).toBeFalsy();
    if (ignoreErrors?.some((re) => re.test(str))) {
      return;
    }
    error(`stderr: ${str}`, {
      title: 'Child Process Error',
      file: sourceFile,
    });
    console.error(`stderr: ${str}`);
    console.error(`sourceFile: ${sourceFile}`);
  });
}

export const test = basicTest.extend<{ page: Page }>({
  page: async ({ page }, pageUse) => {
    const callback = (msg: ConsoleMessage) => {
      if (unexpectedErrors.some((re) => re.test(msg.text()))) {
        throw new Error(msg.text());
      }
      console.log(`${msg.type()}: ${msg.text()}`);
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
  const startApp = async (mode: 'DEV' | 'PRD' | 'STATIC') => {
    if (mode !== 'DEV' && !built) {
      rmSync(`${fixtureDir}/dist`, { recursive: true, force: true });
      execSync(`node ${waku} build`, { cwd: fixtureDir });
      built = true;
    }
    const port = await getFreePort();
    let cmd: string;
    switch (mode) {
      case 'DEV':
        cmd = `node ${waku} dev --port ${port}`;
        break;
      case 'PRD':
        cmd = `node ${waku} start --port ${port}`;
        break;
      case 'STATIC':
        cmd = `pnpm serve -l ${port} dist/public`;
        break;
    }
    const cp = exec(cmd, { cwd: fixtureDir });
    debugChildProcess(cp, fileURLToPath(import.meta.url));
    await waitPort({ port });
    const stopApp = async () => {
      await terminate(cp.pid!);
    };
    return { port, stopApp, fixtureDir };
  };
  return startApp;
};

const PACKAGE_INSTALL = {
  npm: (path: string) => `npm add --force ${path}`,
  pnpm: (path: string) => `pnpm add ${path}`,
  yarn: (path: string) => `yarn add ${path}`,
} as const;

export const prepareStandaloneSetup = (fixtureName: string) => {
  const wakuDir = fileURLToPath(new URL('../packages/waku', import.meta.url));
  const { version } = createRequire(import.meta.url)(
    join(wakuDir, 'package.json'),
  );
  const fixtureDir = fileURLToPath(
    new URL('./fixtures/' + fixtureName, import.meta.url),
  );
  // GitHub Action on Windows doesn't support mkdtemp on global temp dir,
  // Which will cause files in `src` folder to be empty. I don't know why
  const tmpDir = process.env.TEMP_DIR || tmpdir();
  let standaloneDir: string | undefined;
  let built = false;
  const startApp = async (
    mode: 'DEV' | 'PRD' | 'STATIC',
    packageManager: 'npm' | 'pnpm' | 'yarn' = 'npm',
    packageDir = '',
  ) => {
    if (!standaloneDir) {
      standaloneDir = mkdtempSync(join(tmpDir, fixtureName));
      cpSync(fixtureDir, standaloneDir, {
        filter: (src) => {
          return !src.includes('node_modules') && !src.includes('dist');
        },
        recursive: true,
      });
      execSync(`pnpm pack --pack-destination ${standaloneDir}`, {
        cwd: wakuDir,
      });
      const wakuPackageTgz = join(standaloneDir, `waku-${version}.tgz`);
      const installScript = PACKAGE_INSTALL[packageManager](wakuPackageTgz);
      execSync(installScript, { cwd: standaloneDir });
      execSync(
        `npm install --force ${join(standaloneDir, `waku-${version}.tgz`)}`,
        { cwd: standaloneDir },
      );
    }
    if (mode !== 'DEV' && !built) {
      rmSync(`${join(standaloneDir, packageDir, 'dist')}`, {
        recursive: true,
        force: true,
      });
      execSync(
        `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} build`,
        { cwd: join(standaloneDir, packageDir) },
      );
      built = true;
    }
    const port = await getFreePort();
    let cmd: string;
    switch (mode) {
      case 'DEV':
        cmd = `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} dev --port ${port}`;
        break;
      case 'PRD':
        cmd = `node ${join(standaloneDir, './node_modules/waku/dist/cli.js')} start --port ${port}`;
        break;
      case 'STATIC':
        cmd = `node ${join(standaloneDir, './node_modules/serve/build/main.js')} dist/public -p ${port}`;
        break;
    }
    const cp = exec(cmd, { cwd: join(standaloneDir, packageDir) });
    debugChildProcess(cp, fileURLToPath(import.meta.url));
    await waitPort({ port });
    const stopApp = async () => {
      await terminate(cp.pid!);
    };
    return { port, stopApp, standaloneDir };
  };
  return startApp;
};
