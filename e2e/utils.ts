import net from 'node:net';
import { test as basicTest } from '@playwright/test';
import type { ConsoleMessage } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';

export async function getFreePort(): Promise<number> {
  return new Promise<number>((res) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => res(port));
    });
  });
}

export function debugChildProcess(cp: ChildProcess) {
  cp.stdout?.on('data', (data) => {
    console.log(`stdout: ${data}`);
  });

  cp.stderr?.on('data', (data) => {
    console.error(`stderr: ${data}`);
  });
}

export const test = basicTest.extend({
  page: async ({ page }, use) => {
    const unexpectedErrors: RegExp[] = [
      /^You did not run Node.js with the `--conditions react-server` flag./,
      /^\(node:14372\)/,
    ];
    const callback = (msg: ConsoleMessage) => {
      if (unexpectedErrors.some((re) => re.test(msg.text()))) {
        throw new Error(msg.text());
      }
      console.log(`${msg.type()}: ${msg.text()}`);
    };
    page.on('console', callback);
    await use(page);
    page.off('console', callback);
  },
});
