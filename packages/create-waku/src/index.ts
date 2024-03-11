import { existsSync, readdirSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { default as prompts } from 'prompts';
import { red, green, bold, cyan } from 'kolorist';
import fse from 'fs-extra/esm';
import checkForUpdate from 'update-check';
import { createRequire } from 'node:module';
import {
  downloadAndExtractExample,
  downloadAndExtractRepo,
  existsInRepo,
  getRepoInfo,
  hasRepo,
  type RepoInfo,
} from './helpers/example-option';

// FIXME is there a better way with prompts?
const { tokens } = parseArgs({
  args: process.argv.slice(2),
  options: {
    example: {
      type: 'string',
    },
  },
  tokens: true,
});

function isErrorLike(err: unknown): err is { message: string } {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as { message?: unknown }).message === 'string'
  );
}
// FIXME no-nay
function getExample(tokens: any) {
  const exampleToken = tokens.find(
    (token: any) => token.kind === 'option' && token.name === 'example',
  );
  return exampleToken?.value;
}
function isValidPackageName(projectName: string) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(
    projectName,
  );
}

function toValidPackageName(projectName: string) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z0-9-~]+/g, '-');
}

// if the dir is empty or not exist
function canSafelyOverwrite(dir: string) {
  return !existsSync(dir) || readdirSync(dir).length === 0;
}

async function notifyUpdate() {
  // keep original require to avoid
  //  bundling the whole package.json by `@vercel/ncc`
  const packageJson = createRequire(import.meta.url)('../package.json');
  const result = await checkForUpdate(packageJson).catch(() => null);
  if (result?.latest) {
    console.log(`A new version of 'create-waku' is available!`);
    console.log('You can update by running: ');
    console.log();
    console.log(`    npm i -g create-waku`);
  }
}

async function installTemplate({
  root,
  packageName,
}: {
  root: string;
  packageName: string;
}) {
  const pkg = {
    name: packageName,
    version: '0.0.0',
  };

  const templateRoot = path.join(
    fileURLToPath(import.meta.url),
    '../../template',
  );
  // maybe include `.DS_Store` on macOS
  const CHOICES = (await fsPromises.readdir(templateRoot)).filter(
    (dir) => !dir.startsWith('.'),
  );

  const templateDir = path.join(templateRoot, CHOICES[0]!);

  // Read existing package.json from the root directory
  const packageJsonPath = path.join(root, 'package.json');

  // Read new package.json from the template directory
  const newPackageJsonPath = path.join(templateDir, 'package.json');
  const newPackageJson = JSON.parse(
    await fsPromises.readFile(newPackageJsonPath, 'utf-8'),
  );

  fse.copySync(templateDir, root);

  await fsPromises.writeFile(
    packageJsonPath,
    JSON.stringify(
      {
        ...newPackageJson,
        ...pkg,
      },
      null,
      2,
    ),
  );

  if (existsSync(path.join(root, 'gitignore'))) {
    await fsPromises.rename(
      path.join(root, 'gitignore'),
      path.join(root, '.gitignore'),
    );
  }
}

async function init() {
  let targetDir = '';
  const defaultProjectName = 'waku-project';

  let result: {
    packageName: string;
    shouldOverwrite: string;
  };

  try {
    result = (await prompts(
      [
        {
          name: 'projectName',
          type: 'text',
          message: 'Project Name',
          initial: defaultProjectName,
          onState: (state: any) =>
            (targetDir = String(state.value).trim() || defaultProjectName),
        },
        {
          name: 'shouldOverwrite',
          type: () => (canSafelyOverwrite(targetDir) ? null : 'confirm'),
          message: `${targetDir} is not empty. Remove existing files and continue?`,
        },
        {
          name: 'overwriteChecker',
          type: (values: any) => {
            if (values === false) {
              throw new Error(red('✖') + ' Operation cancelled');
            }
            return null;
          },
        },
        {
          name: 'packageName',
          type: () => (isValidPackageName(targetDir) ? null : 'text'),
          message: 'Package name',
          initial: () => toValidPackageName(targetDir),
          validate: (dir: string) =>
            isValidPackageName(dir) || 'Invalid package.json name',
        },
      ],
      {
        onCancel: () => {
          throw new Error(red('✖') + ' Operation cancelled');
        },
      },
    )) as any; // FIXME no-any
  } catch (cancelled) {
    if (cancelled instanceof Error) {
      console.log(cancelled.message);
    }
    process.exit(1);
  }
  let repoInfo: RepoInfo | undefined;
  const example = getExample(tokens);

  if (example) {
    let repoUrl: URL | undefined;

    try {
      repoUrl = new URL(example);
    } catch (error: unknown) {
      const err = error as Error & { code: string | undefined };
      if (err.code !== 'ERR_INVALID_URL') {
        console.error(error);
        process.exit(1);
      }
    }

    if (repoUrl) {
      // NOTE check github origin
      if (repoUrl.origin !== 'https://github.com') {
        console.error(
          `Invalid URL: ${red(
            `"${example}"`,
          )}. Only GitHub repositories are supported. Please use a GitHub URL and try again.`,
        );
        process.exit(1);
      }

      repoInfo = await getRepoInfo(repoUrl);

      // NOTE validate reproInfo
      if (!repoInfo) {
        console.error(
          `Found invalid GitHub URL: ${red(
            `"${example}"`,
          )}. Please fix the URL and try again.`,
        );
        process.exit(1);
      }

      const found = await hasRepo(repoInfo);
      // NOTE Do the repo exist?
      if (!found) {
        console.error(
          `Could not locate the repository for ${red(
            `"${example}"`,
          )}. Please check that the repository exists and try again.`,
        );
        process.exit(1);
      }
    } else {
      const found = await existsInRepo(example);

      if (!found) {
        console.error(
          `Could not locate an example named ${red(
            `"${example}"`,
          )}. Please check that the example exists and try again.`,
        );
        process.exit(1);
      }
    }
  }

  console.log('Setting up project...');

  const root = path.resolve(targetDir);
  const { packageName, shouldOverwrite } = result;

  if (shouldOverwrite) {
    fse.emptyDirSync(root);
  } else if (!existsSync(root)) {
    await fsPromises.mkdir(root, { recursive: true });
  }

  if (example) {
    /**
     * If an example repository is provided, clone it.
     */
    try {
      if (repoInfo) {
        console.log(
          `Downloading files from repo ${cyan(example)}. This might take a moment.`,
        );
        console.log();
        await downloadAndExtractRepo(root, repoInfo);
      } else {
        console.log(
          `Downloading files for example ${cyan(example)}. This might take a moment.`,
        );
        console.log();
        await downloadAndExtractExample(root, example);
      }
    } catch (reason) {
      // download error
      throw new Error(isErrorLike(reason) ? reason.message : reason + '');
    }

    // TODO automatically installing dependencies
    // 1. check packageManager
    // 2. and then install dependencies
  } else {
    /**
     * If an example repository is not provided for cloning, proceed
     * by installing from a template.
     */
    await installTemplate({
      root,
      packageName: packageName ?? toValidPackageName(targetDir),
    });
  }

  const manager = process.env.npm_config_user_agent ?? '';
  const packageManager = /pnpm/.test(manager)
    ? 'pnpm'
    : /yarn/.test(manager)
      ? 'yarn'
      : 'npm';

  const commandsMap = {
    install: {
      pnpm: 'pnpm install',
      yarn: 'yarn',
      npm: 'npm install',
    },
    dev: {
      pnpm: 'pnpm dev',
      yarn: 'yarn dev',
      npm: 'npm run dev',
    },
  };

  console.log(`\nDone. Now run:\n`);
  console.log(`${bold(green(`cd ${targetDir}`))}`);
  console.log(`${bold(green(commandsMap.install[packageManager]))}`);
  console.log(`${bold(green(commandsMap.dev[packageManager]))}`);
  console.log();
}

init()
  .then(notifyUpdate)
  .catch((e) => {
    console.error(e);
  });
