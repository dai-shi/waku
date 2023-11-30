import { ConsoleMessage, test as basicTest } from '@playwright/test';

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
