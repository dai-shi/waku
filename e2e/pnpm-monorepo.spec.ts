import { prepareStandaloneSetup, test } from './utils.js';

const startApp = prepareStandaloneSetup('pnpm-monorepo');

test.describe(`ty`, () => {
  let stopApp: () => Promise<void>;
  test.beforeAll(async () => {
    ({ stopApp } = await startApp('PRD', 'pnpm'));
  });
  test.afterAll(async () => {
    await stopApp();
  });
});
