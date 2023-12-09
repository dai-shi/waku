import type { Plugin } from 'vite';

export function nonjsResolvePlugin(): Plugin {
  return {
    name: 'nonjs-resolve-plugin',
    async resolveId(id, importer, options) {
      const path = await import('node:path').catch((e) => {
        // XXX explicit catch to avoid bundle time error
        throw e;
      });
      if (!options.ssr) {
        return id;
      }
      if (!id.endsWith('.js')) {
        return id;
      }
      for (const ext of ['.js', '.ts', '.tsx', '.jsx', '.mjs', '.cjs']) {
        const resolved = await this.resolve(
          id.slice(0, -path.extname(id).length) + ext,
          importer,
          { ...options, skipSelf: true },
        );
        if (resolved) {
          return resolved;
        }
      }
    },
  };
}
