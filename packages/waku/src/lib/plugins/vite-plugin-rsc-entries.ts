import type { Plugin } from 'vite';

export function rscEntriesPlugin(opts: {
  entriesFile: string;
  reExportHonoMiddleware: boolean;
  reExportConnectMiddleware: boolean;
}): Plugin {
  return {
    name: 'rsc-entries-plugin',
    transform(code, id, options) {
      if (!options?.ssr) {
        return;
      }
      // FIXME does this work on windows?
      if (id === opts.entriesFile) {
        if (opts.reExportHonoMiddleware) {
          code += `
export { honoMiddleware } from 'waku';`;
        }
        if (opts.reExportConnectMiddleware) {
          code += `
export { connectMiddleware } from 'waku';`;
        }
        console.log(code);
        return code;
      }
    },
  };
}
