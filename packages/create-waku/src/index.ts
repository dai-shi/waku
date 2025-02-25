import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import fse from 'fs-extra/esm';
import { bold, green, red } from 'kolorist';
import { default as prompts } from 'prompts';
import checkForUpdate from 'update-check';
import {
  downloadAndExtract,
  parseExampleOption,
} from './helpers/example-option.js';
import {
  getTemplateNames,
  installTemplate,
} from './helpers/install-template.js';

const userAgent = process.env.npm_config_user_agent || '';

const packageManager = /bun/.test(userAgent)
  ? 'bun'
  : /pnpm/.test(userAgent)
    ? 'pnpm'
    : /yarn/.test(userAgent)
      ? 'yarn'
      : 'npm';

const commands = {
  pnpm: {
    install: 'pnpm install',
    dev: 'pnpm dev',
    create: 'pnpm create waku',
  },
  yarn: {
    install: 'yarn',
    dev: 'yarn dev',
    create: 'yarn create waku',
  },
  npm: {
    install: 'npm install',
    dev: 'npm run dev',
    create: 'npm create waku',
  },
  bun: {
    install: 'bun install',
    dev: 'bun dev',
    create: 'bun create waku',
  },
}[packageManager];

const templateRoot = path.join(
  fileURLToPath(import.meta.url),
  '../../template',
);

// FIXME is there a better way with prompts?
const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    choose: {
      type: 'boolean',
    },
    template: {
      type: 'string',
    },
    example: {
      type: 'string',
    },
    'project-name': {
      type: 'string',
    },
    help: {
      type: 'boolean',
      short: 'h',
    },
  },
});

async function doPrompts() {
  const isValidPackageName = (projectName: string) =>
    /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(
      projectName,
    );

  const toValidPackageName = (projectName: string) =>
    projectName
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/^[._]/, '')
      .replace(/[^a-z0-9-~]+/g, '-');

  // if the dir is empty or not exist
  const canSafelyOverwrite = (dir: string) =>
    !existsSync(dir) || readdirSync(dir).length === 0;

  const templateNames = await getTemplateNames(templateRoot);

  const defaultProjectName = 'waku-project';
  let targetDir = values['project-name'] || defaultProjectName;

  try {
    const result = await prompts(
      [
        {
          name: 'projectName',
          type: values['project-name'] ? null : 'text',
          message: 'Project Name',
          initial: defaultProjectName,
          onState: (state: any) => (targetDir = String(state.value).trim()),
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
        {
          name: 'templateName',
          type: values['choose'] ? 'select' : null,
          message: 'Choose a starter template',
          choices: templateNames.map((name) => ({
            title: name,
            value: name,
          })),
        },
      ],
      {
        onCancel: () => {
          throw new Error(red('✖') + ' Operation cancelled');
        },
      },
    );
    return {
      ...result,
      packageName: result.packageName ?? toValidPackageName(targetDir),
      templateName: result.templateName ?? values.template ?? templateNames[0],
      targetDir,
    };
  } catch (err) {
    if (err instanceof Error) {
      console.log(err.message);
    }
    process.exit(1);
  }
}

function displayUsage() {
  console.log(`
Usage: ${commands.create} [options]

Options:
  --choose              Choose from the template list
  --template            Specify a template
  --example             Specify an example use as a template
  --project-name        Specify a project name
  -h, --help            Display this help message
`);
}

async function notifyUpdate() {
  const packageJson = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
  );
  const result = await checkForUpdate(packageJson).catch(() => {});
  if (result?.latest) {
    console.log(`A new version of 'create-waku' is available!`);
    console.log('You can update by running: ');
    console.log();
    console.log(`    npm i -g create-waku`);
  }
}

async function init() {
  if (values.help) {
    displayUsage();
    return;
  }

  const exampleOption = await parseExampleOption(values.example);

  const { packageName, templateName, shouldOverwrite, targetDir } =
    await doPrompts();
  const root = path.resolve(targetDir);

  console.log('Setting up project...');

  if (shouldOverwrite) {
    fse.emptyDirSync(root);
  } else if (!existsSync(root)) {
    await fsPromises.mkdir(root, { recursive: true });
  }

  if (exampleOption) {
    // If an example repository is provided, clone it.
    await downloadAndExtract(root, exampleOption);
  } else {
    // If an example repository is not provided for cloning, proceed
    // by installing from a template.
    await installTemplate(root, packageName, templateRoot, templateName);
  }

  // 1. check packageManager
  // 2. and then install dependencies
  console.log();
  console.log(`Installing dependencies by running ${commands.install}...`);

  const installProcess = spawn(packageManager, ['install'], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    cwd: targetDir,
  });

  installProcess.on('close', (code) => {
    // process exit code
    if (code !== 0) {
      console.log(`Could not execute ${commands.install}. Please run`);
      console.log(`${bold(green(`cd ${targetDir}`))}`);
      console.log(`${bold(green(commands.install))}`);
      console.log(`${bold(green(commands.dev))}`);
      console.log();
    } else {
      console.log(`\nDone. Now run:\n`);
      console.log(`${bold(green(`cd ${targetDir}`))}`);
      console.log(`${bold(green(commands.dev))}`);
      console.log();
    }
  });
}

init()
  .then(notifyUpdate)
  .catch((e) => {
    console.log(e);
  });
