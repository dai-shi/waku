import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import {
  mkdir,
  rmdir,
  readdir,
  cp,
  readFile,
  writeFile,
} from 'node:fs/promises';
import { expect } from '@playwright/test';

import { test, debugChildProcess, terminate } from './utils.js';

test('should create waku with default setup work', async () => {
  const cliPath = fileURLToPath(
    new URL('../packages/create-waku/dist/index.js', import.meta.url),
  );

  const dirname = crypto.randomUUID();
  await mkdir(new URL(`./.cache/${dirname}/`, import.meta.url), {
    recursive: true,
  });
  const cwd = fileURLToPath(new URL(`./.cache/${dirname}`, import.meta.url));
  const childProcess = spawn(process.execPath, [cliPath], {
    cwd,
    env: process.env,
  });
  debugChildProcess(childProcess, fileURLToPath(import.meta.url));
  const writeNewLine = async () =>
    new Promise<void>((resolve) =>
      childProcess.stdin.write('\n', () => resolve()),
    ); // will use default
  for await (const data of childProcess.stdout) {
    const str = data.toString();
    if (str.includes('Project Name')) {
      await writeNewLine();
    } else if (str.includes('Choose a starter template')) {
      await writeNewLine();
    }
  }
  const paths = await readdir(cwd);
  expect(paths[0]).toBe('waku-project');
  expect(paths.length).toBe(1);
  const files = await readdir(
    new URL(`./.cache/${dirname}/waku-project`, import.meta.url),
  );
  expect(files).toContain('package.json');
  expect(files).toContain('src');
  expect(files).toContain('tsconfig.json');
  try {
    await terminate(childProcess.pid!);
  } catch {
    // ignore
  }
  await rmdir(cwd, { recursive: true });
});

test('should create waku with update notify work', async () => {
  const oldCliDir = fileURLToPath(
    new URL('../packages/create-waku/', import.meta.url),
  );
  const dirname = crypto.randomUUID();
  const newCliDir = new URL(
    `./.cache/${dirname}/create-waku/`,
    import.meta.url,
  );
  await cp(oldCliDir, newCliDir, {
    recursive: true,
  });
  const packageJsonPath = new URL('./package.json', newCliDir);
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf-8'));
  packageJson.version = '0.0.1';
  await writeFile(packageJsonPath, JSON.stringify(packageJson, null, 2));

  const cliPath = fileURLToPath(new URL('./dist/index.js', newCliDir));
  await mkdir(new URL(`./.cache/${dirname}/`, import.meta.url), {
    recursive: true,
  });
  const cwd = fileURLToPath(new URL(`./.cache/${dirname}`, import.meta.url));
  const childProcess = spawn(process.execPath, [cliPath], {
    cwd,
    env: process.env,
  });
  debugChildProcess(childProcess, fileURLToPath(import.meta.url));
  const writeNewLine = async () =>
    new Promise<void>((resolve) =>
      childProcess.stdin.write('\n', () => resolve()),
    ); // will use default
  let found = false;
  for await (const data of childProcess.stdout) {
    const str = data.toString();
    if (str.includes('Project Name')) {
      await writeNewLine();
    } else if (str.includes('Choose a starter template')) {
      await writeNewLine();
    }
    if (str.includes(`A new version of 'create-waku' is available!`)) {
      found = true;
      break;
    }
  }
  expect(found).toBe(true);
  try {
    await terminate(childProcess.pid!);
  } catch {
    // ignore
  }
  await rmdir(cwd, { recursive: true });
});
