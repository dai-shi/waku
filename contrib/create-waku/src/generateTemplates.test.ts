import fs from 'node:fs'
import path from 'node:path'
import assert from 'node:assert'
import { green, bold } from 'kolorist'
import { spawnSync } from 'node:child_process'

// Test case
function testTemplateGeneration() {
  const cwd = process.cwd()

  const templateDir = path.resolve(cwd, '../../examples', '01_counter')
  const targetDir = path.resolve(cwd, './playground', 'basic')

  const result = spawnSync('cp', ['-r', `${templateDir}/`, targetDir])
  if (result.error) {
    console.error('Error copying files:', result.error.message)
    process.exit(1)
  }

  // Check if the file was generated
  const fileExists = fs.existsSync(targetDir);
  // @ts-expect-error
  assert.strictEqual(fileExists, true, console.log(bold(green(`Template generated successfully.`))))

  // Clean up the generated file after the test
  spawnSync('rm', ['-rf', `${targetDir}`])
}

// Run the test
testTemplateGeneration()
