import fs from 'node:fs';
import path from 'node:path';

export function renderTemplate(src: string, dest: string) {
  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      renderTemplate(path.resolve(src, file), path.resolve(dest, file));
    }
    return;
  }

  const filename = path.basename(src);

  if (filename === 'package.json' && fs.existsSync(dest)) {
    // @ts-expect-error
    const pkg = Object.assign({}, JSON.parse(fs.readFileSync(src)), JSON.parse(fs.readFileSync(dest)))
    fs.writeFileSync(dest, JSON.stringify(pkg, null, 2) + '\n');
    return;
  }

  fs.copyFileSync(src, dest);
}
