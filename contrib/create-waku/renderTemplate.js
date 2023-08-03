import fs from 'fs';
import path from 'path';
import deepMerge from './deepMerge.js'

function renderTemplate(src, dest) {
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
    // merge instead of overwriting
    const pkg = deepMerge(
      JSON.parse(fs.readFileSync(dest)),
      JSON.parse(fs.readFileSync(src))
    );
    fs.writeFileSync(dest, JSON.stringify(pkg, null, 2) + '\n');
    return;
  }

  if (filename.startsWith('_')) {
    // rename `_file` to `.file`
    dest = path.resolve(path.dirname(dest), filename.replace(/^_/, '.'));
  }

  fs.copyFileSync(src, dest);
}

export default renderTemplate;
