import type { Plugin } from 'vite';
import * as swc from '@swc/core';

import { EXTENSIONS } from '../config.js';
import { extname } from '../utils/path.js';
import { parseOpts } from '../utils/swc.js';

const collectExportNames = (mod: swc.Module) => {
  const exportNames = new Set<string>();
  for (const item of mod.body) {
    if (item.type === 'ExportDeclaration') {
      if (item.declaration.type === 'FunctionDeclaration') {
        exportNames.add(item.declaration.identifier.value);
      } else if (item.declaration.type === 'VariableDeclaration') {
        for (const d of item.declaration.declarations) {
          if (d.id.type === 'Identifier') {
            exportNames.add(d.id.value);
          }
        }
      }
    } else if (item.type === 'ExportNamedDeclaration') {
      for (const s of item.specifiers) {
        if (s.type === 'ExportSpecifier') {
          exportNames.add(s.exported ? s.exported.value : s.orig.value);
        }
      }
    } else if (item.type === 'ExportDefaultExpression') {
      exportNames.add('default');
    } else if (item.type === 'ExportDefaultDeclaration') {
      exportNames.add('default');
    }
  }
  return exportNames;
};

const transformClient = (
  code: string,
  id: string,
  getServerId: (id: string) => string,
) => {
  const ext = extname(id);
  const mod = swc.parseSync(code, parseOpts(ext));
  let hasUseServer = false;
  for (const item of mod.body) {
    if (item.type === 'ExpressionStatement') {
      if (
        item.expression.type === 'StringLiteral' &&
        item.expression.value === 'use server'
      ) {
        hasUseServer = true;
      }
    } else {
      break;
    }
  }
  if (hasUseServer) {
    const exportNames = collectExportNames(mod);
    let newCode = `
import { createServerReference } from 'react-server-dom-webpack/client';
import { callServerRSC } from 'waku/client';
`;
    for (const name of exportNames) {
      newCode += `
export ${name === 'default' ? name : `const ${name} =`} createServerReference('${getServerId(id)}#${name}', callServerRSC);
`;
    }
    return newCode;
  }
};

const createIdentifier = (value: string): swc.Identifier => ({
  type: 'Identifier',
  value,
  optional: false,
  span: { start: 0, end: 0, ctxt: 0 },
});

const createStringLiteral = (value: string): swc.StringLiteral => ({
  type: 'StringLiteral',
  value,
  span: { start: 0, end: 0, ctxt: 0 },
});

const serverActionsInitCode = swc.parseSync(`
import { registerServerReference as __waku_registerServerReference } from 'react-server-dom-webpack/server.edge';
export const __waku_serverActions = new Map();
let __waku_actionIndex = 0;
function __waku_registerServerAction(fn, actionId) {
  const actionName = 'action' + __waku_actionIndex++;
  __waku_registerServerReference(fn, actionId, actionName);
  // FIXME this can cause memory leaks
  __waku_serverActions.set(actionName, fn);
  return fn;
}
`).body;

type FunctionWithBlockBody = (
  | swc.FunctionDeclaration
  | swc.FunctionExpression
  | swc.ArrowFunctionExpression
) & { body: swc.BlockStatement };

const isServerAction = (node: swc.Node): node is FunctionWithBlockBody =>
  (node.type === 'FunctionDeclaration' ||
    node.type === 'FunctionExpression' ||
    node.type === 'ArrowFunctionExpression') &&
  (node as { body?: { type: string } }).body?.type === 'BlockStatement' &&
  (node as FunctionWithBlockBody).body.stmts.some(
    (s) =>
      s.type === 'ExpressionStatement' &&
      s.expression.type === 'StringLiteral' &&
      s.expression.value === 'use server',
  );

const transformServerActions = (
  mod: swc.Module,
  getActionId: () => string,
): swc.Module | void => {
  let hasServerActions = false;
  const registerServerAction: {
    (fn: swc.FunctionDeclaration): swc.ExpressionStatement;
    (
      fn: swc.FunctionExpression | swc.ArrowFunctionExpression,
    ): swc.CallExpression;
  } = (fn): any => {
    hasServerActions = true;
    const exp: swc.CallExpression = {
      type: 'CallExpression',
      callee: createIdentifier('__waku_registerServerAction'),
      arguments: [
        { expression: fn.type === 'FunctionDeclaration' ? fn.identifier : fn },
        { expression: createStringLiteral(getActionId()) },
      ],
      span: { start: 0, end: 0, ctxt: 0 },
    };
    if (fn.type !== 'FunctionDeclaration') {
      return exp;
    }
    return {
      type: 'ExpressionStatement',
      expression: exp,
      span: { start: 0, end: 0, ctxt: 0 },
    };
  };
  const handleStatements = (stmts: swc.Statement[] | swc.ModuleItem[]) => {
    for (let i = 0; i < stmts.length; ++i) {
      const stmt = stmts[i]!;
      if (isServerAction(stmt)) {
        const registerStmt = registerServerAction(stmt);
        stmts.splice(++i, 0, registerStmt);
      }
    }
  };
  const handleExpression = (exp: swc.Expression) => {
    if (isServerAction(exp)) {
      const callExp = registerServerAction(Object.assign({}, exp));
      Object.keys(exp).forEach((key) => {
        delete exp[key as keyof typeof exp];
      });
      Object.assign(exp, callExp);
    }
  };
  const walk = (node: swc.Node) => {
    // FIXME do we need to walk the entire tree? feels inefficient
    Object.values(node).forEach((value) => {
      (Array.isArray(value) ? value : [value]).forEach((v) => {
        if (typeof v?.type === 'string') {
          walk(v);
        } else if (typeof v?.expression?.type === 'string') {
          walk(v.expression);
        }
      });
    });
    if (node.type === 'Module') {
      const { body } = node as swc.Module;
      handleStatements(body);
    } else if (node.type === 'BlockStatement') {
      const { stmts } = node as swc.BlockStatement;
      handleStatements(stmts);
    } else if (
      node.type === 'FunctionExpression' ||
      node.type === 'ArrowFunctionExpression'
    ) {
      handleExpression(
        node as swc.FunctionExpression | swc.ArrowFunctionExpression,
      );
    }
  };
  walk(mod);
  if (!hasServerActions) {
    return;
  }
  const lastImportIndex = mod.body.findIndex(
    (node) =>
      node.type !== 'ExpressionStatement' && node.type !== 'ImportDeclaration',
  );
  mod.body.splice(lastImportIndex, 0, ...serverActionsInitCode);
  return mod;
};

const transformServer = (
  code: string,
  id: string,
  getClientId: (id: string) => string,
  getServerId: (id: string) => string,
) => {
  const ext = extname(id);
  const mod = swc.parseSync(code, parseOpts(ext));
  let hasUseClient = false;
  let hasUseServer = false;
  for (const item of mod.body) {
    if (item.type === 'ExpressionStatement') {
      if (item.expression.type === 'StringLiteral') {
        if (item.expression.value === 'use client') {
          hasUseClient = true;
        } else if (item.expression.value === 'use server') {
          hasUseServer = true;
        }
      }
    } else {
      // HACK we can't stop the loop here, because vite may put some import statements before the directives
      // break;
    }
  }
  if (hasUseClient) {
    const exportNames = collectExportNames(mod);
    let newCode = `
import { registerClientReference } from 'react-server-dom-webpack/server.edge';
`;
    for (const name of exportNames) {
      newCode += `
export ${name === 'default' ? name : `const ${name} =`} registerClientReference(() => { throw new Error('It is not possible to invoke a client function from the server: ${getClientId(id)}#${name}'); }, '${getClientId(id)}', '${name}');
`;
    }
    return newCode;
  } else if (hasUseServer) {
    const exportNames = collectExportNames(mod);
    let newCode =
      code +
      `
import { registerServerReference } from 'react-server-dom-webpack/server.edge';
`;
    for (const name of exportNames) {
      newCode += `
if (typeof ${name} === 'function') {
  registerServerReference(${name}, '${getServerId(id)}', '${name}');
}
`;
    }
    return newCode;
  }
  // transform server actions in server components
  const newMod =
    code.includes('use server') &&
    transformServerActions(mod, () => getServerId(id));
  if (newMod) {
    const newCode = swc.printSync(newMod).code;
    return newCode;
  }
};

export function rscTransformPlugin(
  opts:
    | {
        isClient: true;
        isBuild: false;
      }
    | {
        isClient: true;
        isBuild: true;
        serverEntryFiles: Record<string, string>;
      }
    | {
        isClient: false;
        isBuild: false;
      }
    | {
        isClient: false;
        isBuild: true;
        clientEntryFiles: Record<string, string>;
        serverEntryFiles: Record<string, string>;
      },
): Plugin {
  const getClientId = (id: string) => {
    if (opts.isClient || !opts.isBuild) {
      throw new Error('not buiding for server');
    }
    for (const [k, v] of Object.entries(opts.clientEntryFiles)) {
      if (v === id) {
        return `@id/${k}.js`;
      }
    }
    throw new Error('client id not found: ' + id);
  };
  const getServerId = (id: string) => {
    if (!opts.isBuild) {
      throw new Error('not buiding');
    }
    for (const [k, v] of Object.entries(opts.serverEntryFiles)) {
      if (v === id) {
        return `@id/${k}.js`;
      }
    }
    throw new Error('server id not found: ' + id);
  };
  return {
    name: 'rsc-transform-plugin',
    async transform(code, id, options) {
      if (!opts.isBuild) {
        // id can contain query string with vite deps optimization
        id = id.split('?')[0] as string;
      }
      if (!EXTENSIONS.includes(extname(id))) {
        return;
      }
      if (opts.isClient) {
        if (options?.ssr) {
          return;
        }
        return transformClient(
          code,
          id,
          opts.isBuild ? getServerId : (id) => id,
        );
      }
      // isClient === false
      if (!options?.ssr) {
        return;
      }
      return transformServer(
        code,
        id,
        opts.isBuild ? getClientId : (id) => id,
        opts.isBuild ? getServerId : (id) => id,
      );
    },
  };
}
