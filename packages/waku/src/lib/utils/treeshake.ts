import { rollup } from 'rollup';
import * as swc from '@swc/core';

export const treeshake = async (code: string): Promise<string> => {
  const mod = swc.transformSync(code, {
    jsc: { parser: { syntax: 'typescript' } },
  });
  const bundle = await rollup({
    input: 'code.js',
    external: () => true,
    onwarn: (warning, defaultHandler) => {
      if (warning.code === 'UNUSED_EXTERNAL_IMPORT') {
        return;
      }
      defaultHandler(warning);
    },
    treeshake: {
      moduleSideEffects: 'no-external',
    },
    plugins: [
      {
        name: 'treeshake',
        resolveId(id) {
          if (id === 'code.js') {
            return '\0code';
          }
        },
        load(id) {
          if (id === '\0code') {
            return mod.code;
          }
        },
      },
    ],
  });
  const { output } = await bundle.generate({});
  return output[0].code;
};
