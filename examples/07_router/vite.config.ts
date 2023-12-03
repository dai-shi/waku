import url from 'node:url';
import path from 'node:path';
import { glob } from 'glob';

const rootDir = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  'src',
);
const routeFiles = glob.sync('routes/**/*.{tsx,js}', { cwd: rootDir });

/** @type {import('vite').UserConfig} */
export default {
  ssr: {
    external: ['glob'],
  },
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
