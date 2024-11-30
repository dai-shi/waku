import net from 'node:net';
import { expect, test as basicTest } from '@playwright/test';
import type { ConsoleMessage } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';
import { error, info } from '@actions/core';
import { createRequire } from 'node:module';

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

export function debugChildProcess(
  cp: ChildProcess,
  sourceFile: string,
  ignoreErrors?: RegExp[],
) {
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

export const test = basicTest.extend({
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
