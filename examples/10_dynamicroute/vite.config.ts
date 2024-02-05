import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { glob } from 'glob';

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'src');
const routeFiles = glob.sync('routes/**/*.{tsx,js}', { cwd: rootDir });

/** @type {import('vite').UserConfig} */
export default {
  build: {
    rollupOptions: {
      input: Object.fromEntries(
        routeFiles.map((fname) => [
          fname.replace(/\.\w+$/, ''),
          path.join(rootDir, fname),
        ]),
      ),
    },
  },
};
