import fs from "node:fs";
import path from "node:path";
import assert from "node:assert";
import { green, bold } from "kolorist";
import fse from "fs-extra/esm";

// Test case
function testTemplateGeneration() {
  const cwd = process.cwd();

  const templateDir = path.resolve(cwd, "../../examples", "01_counter");
  const targetDir = path.resolve(cwd, "./playground", "basic");

  fse.copySync(templateDir, targetDir);

  // Check if the file was generated
  const fileExists = fs.existsSync(targetDir);
  // @ts-expect-error
  assert.strictEqual(
    fileExists,
    true,
    console.log(bold(green(`Template generated successfully.`)))
  );

  // Clean up the generated file after the test
  fse.removeSync(targetDir);
}

// Run the test
testTemplateGeneration();
