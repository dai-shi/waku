import { existsSync } from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import fse from 'fs-extra/esm';

export async function installTemplate(
  root: string,
  packageName: string,
  templateRoot: string,
) {
  const pkg = {
    name: packageName,
    version: '0.0.0',
  };

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
