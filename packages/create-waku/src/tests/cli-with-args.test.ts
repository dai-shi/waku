import fs from 'node:fs';
import path from 'node:path';
import type { Options, SyncOptions } from 'execa';
import { execa, execaSync } from 'execa';
import {
  afterEach,
  beforeAll,
  describe,
  expect,
  onTestFailed,
  test,
} from 'vitest';

const CLI_PATH = path.join(import.meta.dirname, '../../dist/index.js');

const projectName = 'test-waku-app';
const genPath = path.join(import.meta.dirname, projectName);
const genPathWithSubfolder = path.join(
  import.meta.dirname,
  '.test',
  projectName,
);

const printErrors = (command: string, stdout: any, stderr: any) => {
  console.error('======= command');
  console.error(command);
  console.error('======= stdout');
  console.error(stdout);
  console.error('======= stderr');
  console.error(stderr);
  console.error('=======');
};

const run = <SO extends SyncOptions>(args: string[], options?: SO) => {
  const command = `node ${CLI_PATH} ${args.join(' ')}`;
  const result = execaSync('node', [CLI_PATH, ...args], options);
  onTestFailed(() => printErrors(command, result.stdout, result.stderr));
  return result;
};

const runAsync = <Opts extends Options>(args: string[], options?: Opts) => {
  const command = `node ${CLI_PATH} ${args.join(' ')}`;
  const childProcess = execa('node', [CLI_PATH, ...args], options);
  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  childProcess.stdout?.on('data', (chunk) =>
    stdoutLines.push(chunk.toString()),
  );
  childProcess.stderr?.on('data', (chunk) =>
    stderrLines.push(chunk.toString()),
  );
  onTestFailed(() =>
    printErrors(command, stdoutLines.join('\n'), stderrLines.join('\n')),
  );
  return childProcess;
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

const readDependencies = (filePath: string): string[] => {
  const packageJson = JSON.parse(fs.readFileSync(filePath).toString());
  return Object.keys(packageJson.dependencies || {});
};

// the index of the template determines how many times to press "down" to select it
type TemplateCaseArgs = { name: string; index: number; dependencies: string[] };

const templateChooseCases = (() => {
  // grab the current list of templates
  const templatesRootPath = path.join(import.meta.dirname, '../../templates');
  const templates = fs.readdirSync(templatesRootPath).sort();

  const seenDependecies: Set<string>[] = [];

  const cases: TemplateCaseArgs[] = [];

  // for each template, get the dependencies from the package.json
  // TODO there might be a better way to determine what template was actually chosen
  templates.forEach((templateName, templateIndex) => {
    const filePath = path.join(templatesRootPath, templateName, 'package.json');
    const dependencies = readDependencies(filePath);
    // filter templates so that only unique dependency combinations are tested
    for (const seen of seenDependecies) {
      if (
        dependencies.length === seen.size &&
        dependencies.every((item) => seen.has(item))
      ) {
        return;
      }
    }
    seenDependecies.push(new Set(dependencies));
    cases.push({
      name: templateName,
      index: templateIndex,
      dependencies: dependencies,
    });
  });
  return cases;
})();

describe('create-waku CLI with args', () => {
  beforeAll(() => clearAnyPreviousFolders());
  afterEach(() => clearAnyPreviousFolders());

  test('prompts for the project name if none supplied', () => {
    const { stdout } = run([]);
    expect(stdout).toContain('Project Name');
  });

  test('should not prompt for the project name if supplied', () => {
    const { stdout } = run(['--project-name', projectName], {
      cwd: __dirname,
      timeout: 30000,
      reject: false,
    });
    expect(stdout).not.toContain('Project Name');
  }, 15000);

  test('prompts for the template selection', () => {
    const { stdout } = run(['--project-name', projectName, '--choose']);
    expect(stdout).toContain('Choose a starter template');
  });

  test('asks to overwrite non-empty target directory', () => {
    createNonEmptyDir();
    const { stdout } = run(['--project-name', projectName], {
      cwd: import.meta.dirname,
    });
    expect(stdout).toContain(
      `${projectName} is not empty. Remove existing files and continue?`,
    );
  });

  test('asks to overwrite non-empty target directory with subfolder', () => {
    createNonEmptyDir(genPathWithSubfolder);
    const { stdout } = run(['--project-name', `.test/${projectName}`], {
      cwd: import.meta.dirname,
    });
    expect(stdout).toContain(
      `.test/${projectName} is not empty. Remove existing files and continue?`,
    );
  });

  test('displays help message with --help flag', () => {
    const { stdout } = run(['--help'], { cwd: import.meta.dirname });
    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('Options:');
    expect(stdout).toContain('--choose');
    expect(stdout).toContain('--template');
    expect(stdout).toContain('--example');
    expect(stdout).toContain('--project-name');
  });

  test('accepts template option from command line', () => {
    const { stdout } = run(
      ['--project-name', projectName, '--template', '01_basic'],
      { cwd: import.meta.dirname },
    );
    expect(stdout).toContain('Setting up project...');
  }, 10000);

  test('rejects an unknown template with a helpful message', () => {
    const { stdout, stderr, exitCode } = run(
      ['--project-name', projectName, '--template', 'does-not-exist'],
      { cwd: import.meta.dirname, reject: false },
    );
    const output = stdout + stderr;
    expect(output).toContain('Unknown template "does-not-exist"');
    expect(output).toContain('--example');
    expect(exitCode).not.toBe(0);
  }, 10000);

  test(
    'accepts example option from command line',
    { timeout: 30000, retry: process.env.CI ? 3 : 0 },
    () => {
      const { stdout } = run(
        [
          '--project-name',
          projectName,
          '--example',
          'https://github.com/wakujs/waku-examples/tree/main/fs-router/basic',
        ],
        { cwd: import.meta.dirname, timeout: 30000, reject: false },
      );
      expect(stdout).toContain('Setting up project...');
    },
  );

  test('shows installation instructions after setup', () => {
    const { stdout } = run(
      ['--project-name', projectName, '--template', '01_basic'],
      { cwd: import.meta.dirname, timeout: 30000, reject: false },
    );

    expect(stdout).toContain('Installing dependencies by running');
  }, 10000);

  test('handles choose flag to explicitly prompt for template', () => {
    const { stdout } = run(['--project-name', projectName, '--choose'], {
      cwd: import.meta.dirname,
    });
    expect(stdout).toContain('Choose a starter template');
  });

  test('starts installation process after template selection', () => {
    const { stdout } = run(
      ['--project-name', projectName, '--template', '01_basic'],
      { cwd: import.meta.dirname, timeout: 30000, reject: false },
    );
    expect(stdout).toContain('Setting up project...');
    expect(stdout).toContain('Installing dependencies by running');
  }, 10000);

  test('shows completion message with instructions', () => {
    const { stdout } = run(
      [
        '--project-name',
        projectName,
        '--template',
        '01_basic',
        '--skip-install',
      ],
      { cwd: import.meta.dirname, reject: false },
    );

    // Check for either successful installation or manual instructions
    const hasCompletionMessage =
      stdout.includes('Now run:') ||
      stdout.includes('Could not execute') ||
      stdout.includes('Done. Now run:');

    expect(hasCompletionMessage).toBe(true);
  });

  test.each(templateChooseCases)(
    'interactively choosing template #$index: $name',
    // this tests the --choose option is used when picking a template
    async ({ dependencies, index }: TemplateCaseArgs) => {
      const cmd = runAsync(
        ['--project-name', projectName, '--choose', '--skip-install'],
        {
          cwd: import.meta.dirname,
          reject: false,
        },
      );
      // We input 'j' (vimspeak for down) x times depending on the template's index
      // \r\n simulates enter
      const keyStrokes = new Array(index).fill('j').join('');
      cmd.stdin.write(`${keyStrokes}\r\n`);
      // close stdin otherwise the process will hang and test will timeout
      cmd.stdin.end();
      await cmd;
      const packageJsonPath = path.join(genPath, 'package.json');
      expect(fs.existsSync(packageJsonPath)).toBe(true);
      const actualDependencies = readDependencies(packageJsonPath);
      expect(new Set(actualDependencies)).toEqual(new Set(dependencies));
    },
  );
});
