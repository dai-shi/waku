import url from 'node:url';
import path from 'node:path';

const modulesRoot = path.join(
  path.dirname(url.fileURLToPath(import.meta.url)),
  'src',
);

/** @type {import('vite').UserConfig} */
export default {
  ssr: {
    external: ['glob'],
  },
  build: {
    rollupOptions: {
      output: {
        // FIXME this doesn't seem to provide nice output.
        // TODO we should use `input` instead.
        preserveModules: true,
        preserveModulesRoot: modulesRoot,
      },
    },
  },
};
