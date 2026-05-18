import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type BuildOptions = {
  distDir: string;
  privateDir: string;
  rscBase: string;
  DIST_PUBLIC: string;
  serverless: boolean;
};

async function postBuild({
  distDir,
  privateDir,
  rscBase,
  DIST_PUBLIC,
  serverless,
}: BuildOptions) {
  if (serverless) {
    const functionsDir = path.resolve('netlify-functions');
    mkdirSync(functionsDir, {
      recursive: true,
    });
    writeFileSync(
      path.join(functionsDir, 'serve.js'),
      `\
const { INTERNAL_runFetch } = await import(${JSON.stringify(`../${distDir}/server/index.js`)});

export default async (request, context) =>
  INTERNAL_runFetch(process.env, request, { context });

export const config = {
  preferStatic: true,
  path: ['/', '/*', ${JSON.stringify(`/${rscBase}/**/*`)}],
};
`,
    );
  }
  const netlifyTomlFile = path.resolve('netlify.toml');
  if (!existsSync(netlifyTomlFile)) {
    writeFileSync(
      netlifyTomlFile,
      `\
[build]
  command = "npm run build"
  publish = ${JSON.stringify(`${distDir}/${DIST_PUBLIC}`)}
[functions]
  included_files = [${JSON.stringify(`${privateDir}/**`)}]
  directory = "netlify-functions"
`,
    );
  }
}

export default async function buildEnhancer(
  build: (utils: unknown, options: BuildOptions) => Promise<void>,
): Promise<typeof build> {
  return async (utils: unknown, options: BuildOptions) => {
    await build(utils, options);
    await postBuild(options);
  };
}
