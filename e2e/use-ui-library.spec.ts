import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from './utils.js';
import { rm } from 'node:fs/promises';

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

const cwd = fileURLToPath(
  new URL('./fixtures/use-ui-library', import.meta.url),
);

test.describe(`apps with external ui libraries`, () => {
  test.beforeAll('remove cache', async () => {
    await rm(`${cwd}/dist`, {
      recursive: true,
      force: true,
    });
  });

  test('build successfully', async () => {
    execSync(`node ${waku} build`, { cwd });
  });
});
