import fs from 'node:fs';
import path from 'node:path';

export function emptyDir(dir: string) {
  // if the file empty
  if (!fs.existsSync(dir)) {
    return;
  }
  for (const file of fs.readdirSync(dir)) {
    const abs = path.resolve(dir, file);
    if (fs.lstatSync(abs).isDirectory()) {
      emptyDir(abs);
      // after emptying the dir remove the dir itself
      fs.rmdirSync(abs);
    } else {
      fs.unlinkSync(abs);
    }
  }
}
