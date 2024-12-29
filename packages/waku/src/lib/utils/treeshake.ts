import { rollup } from 'rollup';
import * as swc from '@swc/core';

export const treeshake = async (
  code: string,
  modifyModule?: (mod: swc.Module) => void,
): Promise<string> => {
  const mod = swc.parseSync(code, { syntax: 'typescript' });
  modifyModule?.(mod);
  code = swc.printSync(mod).code;
  // FIXME can we avoid this and transform with printSync directly?
  code = swc.transformSync(code, {
    jsc: { parser: { syntax: 'typescript' } },
  }).code;

  const bundle = await rollup({
    input: '\0code',
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
          if (id === '\0code') {
            return id;
          }
        },
        load(id) {
          if (id === '\0code') {
            return code;
          }
        },
        resolveDynamicImport(id) {
          if (typeof id === 'string') {
            return { id, external: true };
          }
        },
      },
    ],
  });
  const { output } = await bundle.generate({});
  await bundle.close();
  return output[0].code;
};

export const removeObjectProperty = (name: string) => {
  const walk = (node: swc.Node) => {
    if (node.type === 'ObjectExpression') {
      const n = node as swc.ObjectExpression;
      const index = n.properties.findIndex(
        (p) =>
          p.type === 'KeyValueProperty' &&
          p.key.type === 'Identifier' &&
          p.key.value === name,
      );
      if (index >= 0) {
        n.properties.splice(index, 1);
        return;
      }
    }
    Object.values(node).forEach((value) => {
      (Array.isArray(value) ? value : [value]).forEach((v) => {
        if (typeof v?.type === 'string') {
          walk(v);
        } else if (typeof v?.expression?.type === 'string') {
          walk(v.expression);
        }
      });
    });
  };
  return walk;
};
