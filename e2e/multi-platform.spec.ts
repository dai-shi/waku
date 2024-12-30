import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rm } from 'node:fs/promises';
import { expect } from '@playwright/test';

import { test } from './utils.js';

const dryRunList = [
  // without entries.tsx
  {
    cwd: fileURLToPath(new URL('./fixtures/partial-build', import.meta.url)),
    project: 'partial-build',
  },
  // with entries.tsx
  {
    cwd: fileURLToPath(new URL('./fixtures/ssr-basic', import.meta.url)),
    project: 'ssr-basic',
  },
];

const waku = fileURLToPath(
  new URL('../packages/waku/dist/cli.js', import.meta.url),
);

const buildPlatformTarget = [
  {
    platform: '--with-vercel',
    clearDirOrFile: ['dist', '.vercel'],
  },
  {
    platform: '--with-vercel-static',
    clearDirOrFile: ['dist'],
  },
  {
    platform: '--with-netlify',
    clearDirOrFile: ['dist', 'netlify', 'netlify.toml'],
  },
  {
    platform: '--with-netlify-static',
    clearDirOrFile: ['dist'],
  },
  {
    platform: '--with-cloudflare',
    clearDirOrFile: ['dist', 'wrangler.toml'],
  },
  {
    platform: '--with-partykit',
    clearDirOrFile: ['dist', 'partykit.json'],
  },
  {
    platform: '--with-deno',
    clearDirOrFile: ['dist'],
  },
  {
    platform: '--with-aws-lambda',
    clearDirOrFile: ['dist'],
  },
];

const cleanListAfterBuild = new Set(
  buildPlatformTarget.reduce(
    (prev: string[], { clearDirOrFile }) => [...prev, ...clearDirOrFile],
    [],
  ),
);

test.describe(`multi platform builds`, () => {
  for (const { cwd, project } of dryRunList) {
    for (const { platform, clearDirOrFile } of buildPlatformTarget) {
      test(`build ${project} with ${platform} should not throw error`, async () => {
        for (const name of clearDirOrFile) {
          await rm(`${cwd}/${name}`, {
            recursive: true,
            force: true,
          });
        }
        try {
          execSync(`node ${waku} build ${platform}`, {
            cwd,
            env: process.env,
          });
        } catch (error) {
          expect(error).toBeNull();
        }
      });
    }

    test.afterAll(async () => {
      for (const name of cleanListAfterBuild) {
        await rm(`${cwd}/${name}`, {
          recursive: true,
          force: true,
        });
      }
    });
  }
});
