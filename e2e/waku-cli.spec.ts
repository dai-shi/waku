// use `pnpm run e2e --filter waku-cli.spec.ts --update-snapshots` to update snapshots
import { execSync } from 'node:child_process';
import { test, wakuCliPath } from './utils.js';
import { expect } from '@playwright/test';
import { platform } from 'node:os';

test('waku --help', () => {
  test.skip(platform() === 'win32', 'snapshot are different on Windows');
  const helperDescription = execSync(`node ${wakuCliPath} --help`, {
    stdio: 'pipe',
  }).toString();
  expect(helperDescription).toMatchSnapshot({
    name: 'waku --help',
  });
});

test('waku dev --help', () => {
  test.skip(platform() === 'win32', 'snapshot are different on Windows');
  const helperDescription = execSync(`node ${wakuCliPath} dev --help`, {
    stdio: 'pipe',
  }).toString();
  expect(helperDescription).toMatchSnapshot({
    name: 'waku dev --help',
  });
});

test('waku build --help', () => {
  test.skip(platform() === 'win32', 'snapshot are different on Windows');
  const helperDescription = execSync(`node ${wakuCliPath} build --help`, {
    stdio: 'pipe',
  }).toString();
  expect(helperDescription).toMatchSnapshot({
    name: 'waku build --help',
  });
});

test('waku start --help', () => {
  test.skip(platform() === 'win32', 'snapshot are different on Windows');
  const helperDescription = execSync(`node ${wakuCliPath} start --help`, {
    stdio: 'pipe',
  }).toString();
  expect(helperDescription).toMatchSnapshot({
    name: 'waku start --help',
  });
});
