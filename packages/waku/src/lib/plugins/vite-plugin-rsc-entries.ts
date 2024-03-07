import { existsSync } from 'node:fs';
import path from 'node:path';
import { normalizePath } from 'vite';
import type { Plugin } from 'vite';

const CONFIG_FILE = 'waku.config.ts'; // XXX only ts extension

export function rscEntriesPlugin(opts: {
  entriesFile: string;
  moduleMap: Record<string, string>;
}): Plugin {
  let codeToAdd = `
export function loadModule(id) {
  switch (id) {
    ${Object.entries(opts.moduleMap)
      .map(([k, v]) => `case '${k}': return import('' + '${v}');`)
      .join('\n')}
    default: throw new Error('Cannot find module: ' + id);
  }
}
`;
  if (existsSync(CONFIG_FILE)) {
    const file = normalizePath(
      path.relative(path.dirname(opts.entriesFile), path.resolve(CONFIG_FILE)),
    );
    codeToAdd += `
export const loadConfig = async () => (await import('${file}')).default;
`;
  } else {
    codeToAdd += `
export const loadConfig = async () => ({});
`;
  }
  return {
    name: 'rsc-entries-plugin',
    transform(code, id) {
      if (id === opts.entriesFile) {
        return code + codeToAdd;
      }
    },
  };
}
