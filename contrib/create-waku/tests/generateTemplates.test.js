import fs from 'fs'
import path from 'path'
import assert from 'assert'
import { green, bold } from 'kolorist'

import renderTemplate from '../renderTemplate.js'
import emptyDir from '../emptyDir.js'

function generateTemplate(targetDir, templateDir) {
  renderTemplate(templateDir, targetDir)
}

// Test case
function testTemplateGeneration() {
  const cwd = process.cwd()

  const templateDir = path.resolve(cwd, '../../examples', '01_counter')
  const targetDir = path.resolve(cwd, '../playground', 'basic')

  // Generate the template
  generateTemplate(targetDir, templateDir);

  // Check if the file was generated
  const fileExists = fs.existsSync(targetDir);
  assert.strictEqual(fileExists, true, console.log(bold(green(`Template generated successfully.`))))

  // Clean up the generated file after the test
  emptyDir(targetDir)
  fs.rmdirSync(targetDir);
}

// Run the test
testTemplateGeneration()
