#!/usr/bin/env node
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';

const directory = './packages/waku/dist';

if (!fs.existsSync(directory)) {
  try {
    execSync('pnpm -r --filter="./packages/waku" run compile', {
      stdio: 'inherit',
    });
    execSync('pnpm install', { stdio: 'inherit' });
  } catch (error) {
    console.error(
      'An error occurred while running postinstall scripts:',
      error,
    );
    process.exit(1);
  }
}
