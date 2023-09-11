#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import prompts from "prompts";
import { red, green, bold } from "kolorist";
import fse from "fs-extra/esm";

function isValidPackageName(projectName: string) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(
    projectName,
  );
}

function toValidPackageName(projectName: string) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/^[._]/, "")
    .replace(/[^a-z0-9-~]+/g, "-");
}

// if the dir is empty or not exist
function canSafelyOverwrite(dir: string) {
  return !fs.existsSync(dir) || fs.readdirSync(dir).length === 0;
}

async function init() {
  let targetDir = "";
  const defaultProjectName = "waku-project";

  const CHOICES = fs.readdirSync("template");
  let result: {
    packageName: string;
    shouldOverwrite: string;
    chooseProject: string;
  };

  try {
    result = await prompts(
      [
        {
          name: "projectName",
          type: "text",
          message: "Project Name",
          initial: defaultProjectName,
          onState: (state: any) =>
            (targetDir = String(state.value).trim() || defaultProjectName),
        },
        {
          name: "shouldOverwrite",
          type: () => (canSafelyOverwrite(targetDir) ? null : "confirm"),
          message: `${targetDir} is not empty. Remove existing files and continue?`,
        },
        {
          name: "overwriteChecker",
          type: (values: any) => {
            if (values === false) {
              throw new Error(red("✖") + " Operation cancelled");
            }
            return null;
          },
        },
        {
          name: "packageName",
          type: () => (isValidPackageName(targetDir) ? null : "text"),
          message: "Package name",
          initial: () => toValidPackageName(targetDir),
          validate: (dir: string) =>
            isValidPackageName(dir) || "Invalid package.json name",
        },
        {
          name: "chooseProject",
          type: "select",
          message: "Choose a starter template",
          choices: [
            { title: "basic-template", value: CHOICES[0] },
            { title: "async-template", value: CHOICES[1] },
            { title: "promise-template", value: CHOICES[2] },
          ],
        },
      ],
      {
        onCancel: () => {
          throw new Error(red("✖") + " Operation cancelled");
        },
      },
    );
  } catch (cancelled) {
    if (cancelled instanceof Error) {
      console.log(cancelled.message);
    }
    process.exit(1);
  }

  const { packageName, shouldOverwrite, chooseProject } = result;

  const root = path.resolve(targetDir);

  if (shouldOverwrite) {
    fse.emptyDirSync(root);
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root, { recursive: true });
  }

  const pkg = {
    name: packageName ?? toValidPackageName(targetDir),
    version: "0.0.0",
  };

  console.log("Setting up project...");

  const templateRoot = path.join(__dirname, "../template");
  const templateDir = path.resolve(templateRoot, chooseProject);

  // Read existing package.json from the root directory
  const packageJsonPath = path.join(root, "package.json");

  // Read new package.json from the template directory
  const newPackageJsonPath = path.join(templateDir, "package.json");
  const newPackageJson = JSON.parse(
    fs.readFileSync(newPackageJsonPath, "utf-8"),
  );

  fse.copySync(templateDir, root);

  fs.writeFileSync(
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

  const manager = process.env.npm_config_user_agent ?? "";
  const packageManager = /pnpm/.test(manager)
    ? "pnpm"
    : /yarn/.test(manager)
    ? "yarn"
    : "npm";

  const commandsMap = {
    install: {
      pnpm: "pnpm install",
      yarn: "yarn",
      npm: "npm install",
    },
    dev: {
      pnpm: "pnpm dev",
      yarn: "yarn dev",
      npm: "npm run dev",
    },
  };

  console.log(`\nDone. Now run:\n`);
  console.log(`${bold(green(`cd ${targetDir}`))}`);
  console.log(`${bold(green(commandsMap.install[packageManager]))}`);
  console.log(`${bold(green(commandsMap.dev[packageManager]))}`);
  console.log();
}

init().catch((e) => {
  console.error(e);
});
