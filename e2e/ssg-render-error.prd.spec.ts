import { exec } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { expect } from '@playwright/test';
import { test } from './utils.js';

const execAsync = promisify(exec);
const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);
const fixtureDir = fileURLToPath(
  new URL('./fixtures/ssg-render-error', import.meta.url),
);

test('build fails when static pages throw during prerendering', async () => {
  const error = await execAsync(`node ${waku} build`, { cwd: fixtureDir }).then(
    () => {
      throw new Error('build should fail');
    },
    (e: { stderr: string }) => e,
  );
  const start = error.stderr.indexOf('AggregateError');
  expect(start).toBeGreaterThan(-1);
  const log = error.stderr.slice(0, start);
  const aggregate = error.stderr.slice(start);
  expect(aggregate).toContain('Render errors occurred while prerendering');
  // a client component throwing while React DOM renders the HTML
  expect(aggregate).toContain('Unexpected error in a client component');
  // a server component throwing inside Suspense reaches the build from the
  // payload, where react keeps its message out of a production build
  expect(aggregate).toContain(
    'An error occurred in the Server Components render',
  );
  expect(log).toContain('Unexpected error inside Suspense');
});
