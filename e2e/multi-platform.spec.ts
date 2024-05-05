import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { test } from './utils.js';
import { rm } from 'node:fs/promises';
import { expect } from '@playwright/test';

const cwd = fileURLToPath(new URL('../examples/01_template', import.meta.url));

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
    clearDirOrFile: ['dist', '.vercel'],
  },
  {
    platform: '--with-netlify',
    clearDirOrFile: ['dist', 'netlify'],
  },
  {
    platform: '--with-netlify-static',
    clearDirOrFile: ['dist', 'netlify', 'netlify.toml'],
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

test.describe(`multi platform builds`, () => {
  for (const { platform, clearDirOrFile } of buildPlatformTarget) {
    test(`build with ${platform} should not throw error`, async () => {
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
});
