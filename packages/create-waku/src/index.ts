import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import fse from 'fs-extra/esm';
import { bold, green, red } from 'picocolors';
import * as p from '@clack/prompts';
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

const onCancel = () => {
  p.cancel(red('✖') + ' Operation cancelled');
  process.exit(0);
};

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
    const { projectName } = await p.group(
      {
        projectName: () =>
          p.text({
            defaultValue: targetDir,
            message: 'Project Name',
            placeholder: defaultProjectName,
          }),
      },
      { onCancel },
    );
    targetDir =
      typeof projectName === 'string' ? projectName.trim() : targetDir;
    if (!canSafelyOverwrite(targetDir)) {
      const confirmed = await p.confirm({
        message: `${targetDir} is not empty. Remove existing files and continue?`,
      });
      if (!confirmed) {
        p.cancel(red('✖') + ' Operation cancelled');
        process.exit(0);
      }
    }

    const results = await p.group(
      {
        packageName: () =>
          p.text({
            message: 'Package name',
            validate: (dir: string) => {
              if (!isValidPackageName(dir)) {
                return 'Invalid package.json name';
              }
            },
          }),
        templateName: () =>
          p.select({
            message: 'Choose a starter template',
            options: templateNames.map((name) => ({
              label: name,
              value: name,
            })),
          }),
      },
      {
        onCancel,
      },
    );

    return {
      ...results,
      packageName: results.packageName ?? toValidPackageName(targetDir),
      templateName: results.templateName ?? values.template ?? templateNames[0],
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

  const { packageName, templateName, targetDir } = await doPrompts();
  const root = path.resolve(targetDir);

  console.log('Setting up project...');

  // doPrompts would exit if the dir exists and overwrite is false
  fse.emptyDirSync(root);
  if (!existsSync(root)) {
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
