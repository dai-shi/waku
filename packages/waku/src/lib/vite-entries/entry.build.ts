import serverEntry from 'virtual:vite-rsc-waku/server-entry';
import { INTERNAL_setAllEnv } from '../../server.js';
import type { Unstable_EmitFile } from '../types.js';
import { joinPath } from '../utils/path.js';

const DO_NOT_BUNDLE = '';

async function resolveModuleId(moduleId: string, rootDir: string) {
  if (moduleId.startsWith('file://')) {
    return moduleId;
  }
  const { pathToFileURL } = (await import(
    /* @vite-ignore */ DO_NOT_BUNDLE + 'node:url'
  )) as typeof import('node:url');
  if (moduleId.startsWith('/')) {
    // treat as project-root relative (not filesystem root)
    return pathToFileURL(joinPath(rootDir, moduleId.slice(1))).href;
  }
  const { createRequire } = (await import(
    /* @vite-ignore */ DO_NOT_BUNDLE + 'node:module'
  )) as typeof import('node:module');
  const require = createRequire(joinPath(rootDir, 'DUMMY.js'));
  const resolved = require.resolve(moduleId);
  return pathToFileURL(resolved).href;
}

export async function INTERNAL_runBuild({
  rootDir,
  emitFile,
}: {
  rootDir: string;
  emitFile: Unstable_EmitFile;
}) {
  INTERNAL_setAllEnv(process.env as any);
  const prunableFiles = new Set<string>();
  let build = serverEntry.build;
  for (const enhancer of serverEntry.buildEnhancers || []) {
    const moduleId = await resolveModuleId(enhancer, rootDir);
    const mod = await import(moduleId);
    build = await mod.default(build);
  }
  await build(
    {
      emitFile,
      unstable_registerPrunableFile: (srcPath) => {
        prunableFiles.add(srcPath);
      },
    },
    serverEntry.buildOptions || {},
  );
  return { prunableFiles: Array.from(prunableFiles) };
}
