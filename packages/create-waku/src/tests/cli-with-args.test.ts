import fs from 'node:fs';
import path from 'node:path';
import type { SyncOptions, SyncResult } from 'execa';
import { execaCommandSync } from 'execa';
import { afterEach, beforeAll, describe, expect, test } from 'vitest';

const CLI_PATH = path.join(__dirname, '../../dist/index.js');

const projectName = 'test-waku-app';
const genPath = path.join(__dirname, projectName);
const genPathWithSubfolder = path.join(__dirname, '.test', projectName);

const run = <SO extends SyncOptions>(
  args: string[],
  options?: SO,
): SyncResult<SO> => {
  return execaCommandSync(`node ${CLI_PATH} ${args.join(' ')}`, options);
};

// Helper to create a non-empty directory
const createNonEmptyDir = (overrideFolder?: string) => {
  // Create the temporary directory
  const newNonEmptyFolder = overrideFolder || genPath;
  fs.mkdirSync(newNonEmptyFolder, { recursive: true });

  // Create a package.json file
  const pkgJson = path.join(newNonEmptyFolder, 'package.json');
  fs.writeFileSync(pkgJson, '{ "foo": "bar" }');
};

const clearAnyPreviousFolders = () => {
  if (fs.existsSync(genPath)) {
    fs.rmSync(genPath, { recursive: true, force: true });
  }
  if (fs.existsSync(genPathWithSubfolder)) {
    fs.rmSync(genPathWithSubfolder, { recursive: true, force: true });
  }
};

describe('create-waku CLI with args', () => {
  beforeAll(() => clearAnyPreviousFolders());
  afterEach(() => clearAnyPreviousFolders());

  test('prompts for the project name if none supplied', () => {
    const { stdout } = run([]);
    expect(stdout).toContain('Project Name');
  });

  test('prompts for the package name', () => {
    const { stdout } = run(['--project-name', projectName]);
    expect(stdout).toContain('Package name');
  });

  test('prompts for the template selection', () => {
    const { stdout } = run([
      '--project-name',
      projectName,
      '--package-name',
      projectName,
    ]);
    expect(stdout).toContain('Choose a starter template');
  });

  test('asks to overwrite non-empty target directory', () => {
    createNonEmptyDir();
    const { stdout } = run(['--project-name', projectName], { cwd: __dirname });
    expect(stdout).toContain(
      `${projectName} is not empty. Remove existing files and continue?`,
    );
  });

  test('asks to overwrite non-empty target directory with subfolder', () => {
    createNonEmptyDir(genPathWithSubfolder);
    const { stdout } = run(['--project-name', `.test/${projectName}`], {
      cwd: __dirname,
    });
    expect(stdout).toContain(
      `.test/${projectName} is not empty. Remove existing files and continue?`,
    );
  });

  test('displays help message with --help flag', () => {
    const { stdout } = run(['--help'], { cwd: __dirname });
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('Options:');
    expect(stdout).toContain('--choose');
    expect(stdout).toContain('--template');
    expect(stdout).toContain('--example');
    expect(stdout).toContain('--project-name');
    expect(stdout).toContain('--package-name');
  });

  test('displays help message with -h alias', () => {
    const { stdout } = run(['-h'], { cwd: __dirname });
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('Options:');
  });

  test('accepts template option from command line', () => {
    const { stdout } = run(
      [
        '--project-name',
        projectName,
        '--package-name',
        projectName,
        '--template',
        '01_template',
      ],
      { cwd: __dirname },
    );
    expect(stdout).toContain('Setting up project...');
  });

  test('accepts example option from command line', () => {
    const { stdout } = run(
      [
        '--project-name',
        projectName,
        '--package-name',
        projectName,
        '--example',
        'https://github.com/dai-shi/waku/tree/main/examples/01_template',
      ],
      { cwd: __dirname },
    );
    expect(stdout).toContain('Setting up project...');
  });

  test('shows installation instructions after setup', () => {
    const { stdout } = run(
      [
        '--project-name',
        projectName,
        '--package-name',
        projectName,
        '--template',
        '01_template',
      ],
      { cwd: __dirname, timeout: 30000, reject: false },
    );

    expect(stdout).toContain('Installing dependencies by running');
  });

  test('handles choose flag to explicitly prompt for template', () => {
    const { stdout } = run(
      [
        '--project-name',
        projectName,
        '--package-name',
        projectName,
        '--choose',
      ],
      {
        cwd: __dirname,
      },
    );
    expect(stdout).toContain('Choose a starter template');
  });

  test('starts installation process after template selection', () => {
    const { stdout } = run(
      [
        '--project-name',
        projectName,
        '--package-name',
        projectName,
        '--template',
        '01_template',
      ],
      { cwd: __dirname },
    );
    expect(stdout).toContain('Setting up project...');
    expect(stdout).toContain('Installing dependencies by running');
  });

  test('shows completion message with instructions', () => {
    const { stdout } = run(
      [
        '--project-name',
        projectName,
        '--package-name',
        projectName,
        '--template',
        '01_template',
      ],
      { cwd: __dirname, timeout: 30000, reject: false },
    );

    // Check for either successful installation or manual instructions
    const hasCompletionMessage =
      stdout.includes('Now run:') ||
      stdout.includes('Could not execute') ||
      stdout.includes('Done. Now run:');

    expect(hasCompletionMessage).toBe(true);
  });
});
