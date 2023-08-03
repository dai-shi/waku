#!/usr/bin/env node

import fs from 'fs'
import path from 'path'
import prompts from 'prompts'
import ora from "ora"
import { red, green, bold } from 'kolorist'

import emptyDir from './emptyDir.js'
import renderTemplate from './renderTemplate.js'

function isValidPackageName(projectName) {
  return /^(?:@[a-z0-9-*~][a-z0-9-*._~]*\/)?[a-z0-9-~][a-z0-9-._~]*$/.test(
    projectName
  )
}

function toValidPackageName(projectName) {
  return projectName
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/^[._]/, '')
    .replace(/[^a-z0-9-~]+/g, '-')
}

// if the dir is empty or not exist
function canSafelyOverwrite(dir) {
  return !fs.existsSync(dir) || fs.readdirSync(dir).length === 0
}

async function init() {
  const cwd = process.cwd();

  let targetDir;
  let defaultProjectName = 'waku-project'

  const spinner = ora("Setting up project...")
  const CHOICES = fs.readdirSync(path.join(cwd, 'template'))
  let result = {}

  try {
    result = await prompts([
      {
        name: 'projectName',
        type: 'text',
        message: 'Project Name',
        initial: defaultProjectName,
        onState: (state) => (targetDir = String(state.value).trim() || defaultProjectName)
      },
      {
        name: 'shouldOverwrite',
        type: () => canSafelyOverwrite(targetDir) ? null : 'confirm',
        message: `${targetDir} is not empty. Remove existing files and continue?`,
      },
      {
        name: 'overwriteChecker',
        type: (values = {}) => {
          if (values.shouldOverwrite === false) {
            throw new Error(red('✖') + ' Operation cancelled')
          }
          return null
        }
      },
      {
        name: 'packageName',
        type: () => (isValidPackageName(targetDir) ? null : 'text'),
        message: 'Package name',
        initial: () => toValidPackageName(targetDir),
        validate: (dir) => isValidPackageName(dir) || 'Invalid package.json name'
      },
      {
        name: 'chooseProject',
        type: 'select',
        message: 'Choose a starter template',
        choices: [
          { title: CHOICES[0], value: CHOICES[0] },
          { title: CHOICES[1], value: CHOICES[1] },
          { title: CHOICES[2], value: CHOICES[2] },
        ],
      }
    ], {
      onCancel: () => {
        throw new Error(red('✖') + ' Operation cancelled')
      }
    })
  } catch (cancelled) {
    console.log(cancelled.message)
    process.exit(1)
  }

  const { packageName, shouldOverwrite, chooseProject } = result

  const root = path.join(cwd, targetDir)
  // const root = path.resolve(cwd, '../playground', targetDir)

  if (shouldOverwrite) {
    emptyDir(root)
  } else if (!fs.existsSync(root)) {
    fs.mkdirSync(root)
  }

  const pkg = { name: packageName, version: '0.0.0' }

  fs.writeFileSync(
    path.resolve(root, 'package.json'),
    JSON.stringify(pkg, null, 2),
  )

  spinner.start();
  const templateRoot = new URL('./template', import.meta.url).pathname

  const render = function render(templateName) {
    const templateDir = path.resolve(templateRoot, templateName)
    renderTemplate(templateDir, root)
    spinner.stop()
  }

  render(chooseProject)

  const packageManager = /pnpm/.test(process.env.npm_execpath)
    ? 'pnpm'
    : /yarn/.test(process.env.npm_execpath)
      ? 'yarn'
      : 'npm'

  const commandsMap = {
    install: {
      pnpm: 'pnpm install',
      yarn: 'yarn',
      npm: 'npm install'
    },
    dev: {
      pnpm: 'pnpm dev',
      yarn: 'yarn dev',
      npm: 'npm run dev'
    }
  }

  console.log(`\nDone. Now run:\n`)
  if (root !== cwd) {
    console.log(`${bold(green(`cd ${path.relative(cwd, root)}`))}`)
  }
  console.log(`${bold(green(commandsMap.install[packageManager]))}`)
  console.log(`${bold(green(commandsMap.dev[packageManager]))}`)
  console.log()
}

init().catch((e) => {
  console.error(e)
})
