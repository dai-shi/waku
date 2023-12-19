// make sure every example has the same version of these packages
// Refs: https://github.com/pnpm/pnpm/issues/2713#issuecomment-1141000426
const enforceSingleVersion = [
  '@hono/node-server',
  'hono',
  'react',
  'react-dom',
  'react-server-dom-webpack',
  'waku',
  'vite',
  '@swc/core',
  '@types/react',
  '@types/react-dom',
  '@vitejs/plugin-react',
  'typescript',
];

function afterAllResolved(lockfile, context) {
  console.log(`Checking duplicate packages`);
  const packagesKeys = Object.keys(lockfile.packages);
  const found = {};
  for (let p of packagesKeys) {
    for (let x of enforceSingleVersion) {
      if (p.startsWith(`/${x}/`)) {
        if (found[x]) {
          found[x] += 1;
        } else {
          found[x] = 1;
        }
      }
    }
  }
  let msg = '';
  for (let p in found) {
    const count = found[p];
    if (count > 1) {
      msg += `${p} found ${count} times\n`;
    }
  }
  if (msg) {
    throw new Error(msg);
  }
  return lockfile;
}

module.exports = {
  hooks: {
    afterAllResolved,
  },
};
