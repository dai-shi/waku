import type { Plugin } from 'vite';

export function rscReloadPlugin(
  moduleImports: Set<string>,
  fn: (type: 'full-reload' | 'rsc-reload') => void,
): Plugin {
  let enabled = false;
  return {
    name: 'rsc-reload-plugin',
    configResolved(config) {
      if (config.mode === 'development') {
        enabled = true;
      }
    },
    async handleHotUpdate(ctx) {
      if (!enabled) {
        return [];
      }
      if (ctx.modules.length && !moduleImports.has(ctx.file)) {
        fn('rsc-reload');
      } else {
        return [];
      }
    },
  };
}
