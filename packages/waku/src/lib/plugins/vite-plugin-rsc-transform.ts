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

// HACK this doesn't work for 100% of cases
const collectIndentifiers = (node: swc.Node, ids: Set<string>) => {
  if (node.type === 'Identifier') {
    ids.add((node as swc.Identifier).value);
  } else if (node.type === 'MemberExpression') {
    collectIndentifiers((node as swc.MemberExpression).object, ids);
  } else if (node.type === 'KeyValuePatternProperty') {
    collectIndentifiers((node as swc.KeyValuePatternProperty).key, ids);
  } else if (node.type === 'AssignmentPatternProperty') {
    collectIndentifiers((node as swc.AssignmentPatternProperty).key, ids);
  } else {
    Object.values(node).forEach((value) => {
      if (Array.isArray(value)) {
        value.forEach((v) => collectIndentifiers(v, ids));
      } else if (typeof value === 'object' && value !== null) {
        collectIndentifiers(value, ids);
      }
    });
  }
};

// HACK this doesn't work for 100% of cases
const collectLocalNames = (
  fn: swc.Fn | swc.ArrowFunctionExpression,
  ids: Set<string>,
) => {
  fn.params.forEach((param) => {
    collectIndentifiers(param, ids);
  });
  let stmts: swc.Statement[];
  if (!fn.body) {
    stmts = [];
  } else if (fn.body?.type === 'BlockStatement') {
    stmts = fn.body.stmts;
  } else {
    // body is Expression
    stmts = [
      {
        type: 'ReturnStatement',
        argument: fn.body,
        span: { start: 0, end: 0, ctxt: 0 },
      },
    ];
  }
  for (const stmt of stmts) {
    if (stmt.type === 'VariableDeclaration') {
      for (const decl of stmt.declarations) {
        collectIndentifiers(decl.id, ids);
      }
    }
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

const transformServerActions = (
  mod: swc.Module,
  actionId: string,
): swc.Module | void => {
  const moduleItems = new Set<swc.ModuleItem>();
  let actionIndex = 0;
  const processServerAction = (
    parentFn: swc.Fn | swc.ArrowFunctionExpression,
    fn: swc.FunctionDeclaration,
  ) => {
    const parentFnVarNames = new Set<string>();
    collectLocalNames(parentFn, parentFnVarNames);
    const fnVarNames = new Set<string>();
    collectIndentifiers(fn, fnVarNames);
    const varNames = Array.from(parentFnVarNames).filter((n) =>
      fnVarNames.has(n),
    );
    const newParams: swc.Param[] = [
      ...varNames.map((n) => ({
        type: 'Parameter' as const,
        pat: createIdentifier(n),
        span: { start: 0, end: 0, ctxt: 0 },
      })),
      ...fn.params,
    ];
    const actionName = `__waku_rsf${actionIndex++}`;
    const restArgsName = '__waku_args';
    const origBodyStmts = fn.body!.stmts.splice(0);
    fn.params = [
      {
        type: 'Parameter' as const,
        pat: {
          type: 'RestElement',
          rest: { start: 0, end: 0, ctxt: 0 },
          argument: createIdentifier(restArgsName),
          span: { start: 0, end: 0, ctxt: 0 },
        },
        span: { start: 0, end: 0, ctxt: 0 },
      },
    ];
    fn.body!.stmts.push({
      type: 'ReturnStatement',
      argument: {
        type: 'CallExpression',
        callee: createIdentifier(actionName),
        arguments: [
          ...varNames.map((n) => ({ expression: createIdentifier(n) })),
          {
            // FIXME is this correct for rest parameters?
            expression: createIdentifier('...' + restArgsName),
          },
        ],
        span: { start: 0, end: 0, ctxt: 0 },
      },
      span: { start: 0, end: 0, ctxt: 0 },
    });
    moduleItems.add({
      type: 'ExportDeclaration',
      declaration: {
        type: 'FunctionDeclaration',
        declare: false,
        generator: false,
        async: false,
        span: { start: 0, end: 0, ctxt: 0 },
        identifier: createIdentifier(actionName),
        params: newParams,
        body: {
          type: 'BlockStatement',
          stmts: origBodyStmts,
          span: { start: 0, end: 0, ctxt: 0 },
        },
      },
      span: { start: 0, end: 0, ctxt: 0 },
    });
    moduleItems.add({
      type: 'ExpressionStatement',
      expression: {
        type: 'CallExpression',
        // HACK hard-coded function name
        callee: createIdentifier('registerServerReference'),
        arguments: [
          { expression: createIdentifier(actionName) },
          { expression: createStringLiteral(actionId) },
          { expression: createStringLiteral(actionName) },
        ],
        span: { start: 0, end: 0, ctxt: 0 },
      },
      span: { start: 0, end: 0, ctxt: 0 },
    });
  };
  const collectServerActions = (
    parentFn: swc.Fn | swc.ArrowFunctionExpression,
    stmts: swc.Statement[],
  ) => {
    for (const stmt of stmts) {
      if (
        stmt.type === 'FunctionDeclaration' &&
        stmt.body?.stmts.some(
          (s) =>
            s.type === 'ExpressionStatement' &&
            s.expression.type === 'StringLiteral' &&
            s.expression.value === 'use server',
        )
      ) {
        processServerAction(parentFn, stmt);
      }
    }
  };
  const walk = (node: swc.ModuleDeclaration | swc.Statement) => {
    if (node.type === 'FunctionDeclaration' && node.body) {
      collectServerActions(node, node.body.stmts);
    } else if (node.type === 'VariableDeclaration') {
      for (const d of node.declarations) {
        if (
          (d.init?.type === 'FunctionExpression' ||
            d.init?.type === 'ArrowFunctionExpression') &&
          d.init.body?.type === 'BlockStatement'
        ) {
          collectServerActions(d.init, d.init.body.stmts);
        }
      }
    } else if (node.type === 'ExportDeclaration') {
      walk(node.declaration);
    } else if (node.type === 'ExportDefaultExpression') {
      if (
        (node.expression.type === 'FunctionExpression' ||
          node.expression.type === 'ArrowFunctionExpression') &&
        node.expression.body?.type === 'BlockStatement'
      ) {
        collectServerActions(node.expression, node.expression.body.stmts);
      }
    } else if (node.type === 'ExportDefaultDeclaration') {
      if (node.decl.type === 'FunctionExpression' && node.decl.body) {
        collectServerActions(node.decl, node.decl.body.stmts);
      }
    }
  };
  mod.body.forEach(walk);
  if (actionIndex === 0) {
    return;
  }
  mod.body.push(...moduleItems);
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
import { registerClientReference } from 'react-server-dom-webpack/server';
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
import { registerServerReference } from 'react-server-dom-webpack/server';
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
  const newMod = transformServerActions(mod, getServerId(id));
  if (newMod) {
    newMod.body.push({
      type: 'ImportDeclaration',
      specifiers: [
        {
          type: 'ImportSpecifier',
          // HACK hard-coded function name
          local: createIdentifier('registerServerReference'),
          isTypeOnly: false,
          span: { start: 0, end: 0, ctxt: 0 },
        },
      ],
      source: createStringLiteral('react-server-dom-webpack/server'),
      typeOnly: false,
      span: { start: 0, end: 0, ctxt: 0 },
    });
    const newCode = swc.printSync(newMod).code;
    console.log('newCode', newCode);
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
