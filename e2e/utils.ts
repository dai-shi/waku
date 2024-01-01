import net from 'node:net';
import { test as basicTest } from '@playwright/test';
import type { ConsoleMessage } from '@playwright/test';
import type { ChildProcess } from 'node:child_process';

const childProcessSet = new Set<ChildProcess>();
const childProcessLoggedSet = new WeakSet<ChildProcess>();

export async function getFreePort(): Promise<number> {
  return new Promise<number>((res) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => res(port));
    });
  });
}

export function collectChildProcess(cp: ChildProcess) {
  childProcessSet.add(cp);
  // disable debug logs in CI, as they are too verbose and mostly useless
  if (!process.env.CI) {
    cp.stdout?.on('data', (data) => {
      console.log(`${data}`);
    });

    cp.stderr?.on('data', (data) => {
      console.error(`${data}`);
    });
  }
}

export const test = basicTest.extend({
  page: async ({ page }, use) => {
    const unexpectedErrors: RegExp[] = [
      /^You did not run Node.js with the `--conditions react-server` flag./,
      /^\(node:14372\)/,
    ];
    const messages: string[] = [];
    const callback = (msg: ConsoleMessage) => {
      if (unexpectedErrors.some((re) => re.test(msg.text()))) {
        throw new Error(msg.text());
      }
      messages.push(msg.text());
    };
    page.on('console', callback);
    await use(page);
    page.off('console', callback);
    console.log('Page console messages:');
    console.log(messages.join('\n'));
    console.log('-'.repeat(80));
  },
});

test.afterEach(
  async (
    // eslint-disable-next-line no-empty-pattern
    {},
    testInfo,
  ) => {
    if (testInfo.status !== testInfo.expectedStatus) {
      console.error(`Test failed: ${testInfo.title}`);
      childProcessSet.forEach((cp) => {
        if (childProcessLoggedSet.has(cp)) {
          return;
        }
        console.error(`Child process(${cp.pid}) stdout:`);
        cp.stdout?.pipe(process.stdout);
        console.error(`Child process(${cp.pid}) stderr:`);
        cp.stderr?.pipe(process.stderr);
        childProcessLoggedSet.add(cp);
      });
    }
  },
);
