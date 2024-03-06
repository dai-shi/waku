import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from './utils.js';
import { expect } from '@playwright/test';

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

const cwd = fileURLToPath(
  new URL('./fixtures/rsc-dynamic-page-no-crash-on-build', import.meta.url),
);

test("rsc-pages-crash-runtime won't crash during build time", async ({
  browserName,
}) => {
  test.skip(browserName !== 'chromium', 'only need test for once');
  const output = execSync(`node ${waku} build`, {
    cwd,
    encoding: 'utf8',
  });
  expect(output).not.toContain('[TEST_BUILD_ERROR]');
});
