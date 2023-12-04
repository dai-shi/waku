import net from 'node:net';
import { ConsoleMessage, test as basicTest } from '@playwright/test';

export async function getFreePort(): Promise<number> {
  return new Promise<number>((res) => {
    const srv = net.createServer();
    srv.listen(0, () => {
      const port = (srv.address() as net.AddressInfo).port;
      srv.close(() => res(port));
    });
  });
}

const unexpectedErrors: RegExp[] = [
  /^You did not run Node.js with the `--conditions react-server` flag./,
  /^\(node:14372\)/,
  /Controller is already closed/,
];

export function validateMessage(message: string) {
  if (unexpectedErrors.some((re) => re.test(message))) {
    throw new Error(message);
  }
}

export const test = basicTest.extend({
  page: async ({ page }, use) => {
    const callback = (msg: ConsoleMessage) => {
      validateMessage(msg.text());
      console.log(`${msg.type()}: ${msg.text()}`);
    };
    page.on('console', callback);
    await use(page);
    page.off('console', callback);
  },
});
