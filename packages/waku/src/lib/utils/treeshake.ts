import { rollup } from 'rollup';

export const treeshake = async (code: string): Promise<string> => {
  const bundle = await rollup({
    input: 'code.js',
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
            return code;
          }
        },
      },
    ],
  });
  const { output } = await bundle.generate({});
  return output[0].code;
};
