import { rollup } from 'rollup';
import * as swc from '@swc/core';

export const treeshake = async (
  code: string,
  modifyModule?: (mod: swc.Module) => void,
  tsx = false,
): Promise<string> => {
  const mod = swc.parseSync(code, { syntax: 'typescript', tsx });
  modifyModule?.(mod);
  const jsCode = swc.transformSync(mod, {
    jsc: {
      target: 'esnext',
      parser: { syntax: 'typescript', tsx },
    },
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
    output: {
      generatedCode: 'es2015',
    },
    treeshake: {
      moduleSideEffects: 'no-external',
      propertyReadSideEffects: false,
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
            return jsCode;
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
