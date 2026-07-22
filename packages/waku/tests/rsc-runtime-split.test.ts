import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

// Modules that evaluate the RSC *client* protocol. Anything an rsc-environment
// entry reaches through a chain of static imports is paying for the client
// runtime at startup, which is what this guard exists to prevent.
const CLIENT_RUNTIME_SPECIFIERS = [
  'react-server-dom-webpack/client.edge',
  '@vitejs/plugin-rsc/rsc/client',
  '@vitejs/plugin-rsc/react/rsc/client',
  // The combined entries re-export the client half, so importing one of them is
  // equivalent to importing the client runtime directly.
  '@vitejs/plugin-rsc/rsc',
  '@vitejs/plugin-rsc/react/rsc',
];

// Every module a Waku app can load in the rsc environment. None of them may
// reach the client runtime through static imports. `lib/vite-rsc/handler.ts` is
// listed explicitly even though `adapter-builders.ts` re-exports it: it is the
// module this guard exists for, so its coverage should not depend on another
// entry happening to import it.
const RSC_ENTRIES = [
  'lib/vite-rsc/handler.ts',
  'adapter-builders.ts',
  'main.react-server.ts',
  'server.ts',
  'minimal/server.ts',
  'router/server.ts',
  'lib/vite-entries/entry.server.tsx',
  'lib/vite-entries/entry.build.ts',
];

const SRC = fileURLToPath(new URL('../src', import.meta.url));

const rel = (file: string) =>
  path.relative(SRC, file).replaceAll(path.sep, '/');

const existing = (base: string) =>
  ['.ts', '.tsx'].map((ext) => base + ext).find((c) => fs.existsSync(c));

// `waku/...` self-imports, derived from the package's own export map so new
// subpaths are picked up automatically.
const SELF_IMPORTS = new Map<string, string>();
{
  const pkg = JSON.parse(
    fs.readFileSync(
      fileURLToPath(new URL('../package.json', import.meta.url)),
      'utf8',
    ),
  ) as { exports: Record<string, Record<string, string>> };
  for (const [subpath, target] of Object.entries(pkg.exports)) {
    if (subpath.includes('*') || typeof target !== 'object') {
      continue;
    }
    const dist = target['react-server'] ?? target['default'];
    if (typeof dist !== 'string') {
      continue;
    }
    const file = existing(
      path.join(SRC, dist.replace('./dist/', '').replace(/\.js$/, '')),
    );
    if (file) {
      SELF_IMPORTS.set(subpath.replace(/^\./, 'waku'), file);
    }
  }
}

// Captures the statement head and the specifier of static `import`/`export ...
// from` forms only. Dynamic `import('...')` is deliberately not matched:
// deferring the client runtime behind one is the mechanism under test.
const STATIC_IMPORT_RE =
  /(?:^|[\s;}])((?:import|export)\s(?:[\s\S]*?\sfrom\s)?)['"]([^'"]+)['"]/g;

const isTypeOnly = (head: string) => /^(?:import|export)\s+type\s/.test(head);

// A `'use client'` module is a client-reference boundary: the rsc environment
// turns it into references and never evaluates its body, so its imports are not
// rsc-environment edges.
const isClientBoundary = (source: string) =>
  /^\s*(['"])use client\1/.test(source);

const resolve = (fromFile: string, specifier: string) => {
  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const base = path.resolve(path.dirname(fromFile), specifier);
    return base.endsWith('.js')
      ? (existing(base.replace(/\.js$/, '')) ?? undefined)
      : (existing(base) ?? undefined);
  }
  return SELF_IMPORTS.get(specifier);
};

/** Walks the static import graph of `entry`, stopping at client boundaries. */
const walkStaticGraph = (entry: string) => {
  const modules = new Set<string>();
  const boundaries = new Set<string>();
  const clientRuntimeImporters = new Set<string>();
  const queue = [path.join(SRC, entry)];
  while (queue.length) {
    const file = queue.pop()!;
    if (modules.has(rel(file))) {
      continue;
    }
    modules.add(rel(file));
    const source = fs.readFileSync(file, 'utf8');
    if (isClientBoundary(source)) {
      boundaries.add(rel(file));
      continue;
    }
    for (const [, head, specifier] of source.matchAll(STATIC_IMPORT_RE)) {
      if (isTypeOnly(head!)) {
        continue;
      }
      if (CLIENT_RUNTIME_SPECIFIERS.includes(specifier!)) {
        clientRuntimeImporters.add(rel(file));
        continue;
      }
      const resolved = resolve(file, specifier!);
      if (resolved) {
        queue.push(resolved);
      } else if (specifier!.startsWith('.')) {
        expect.unreachable(`unresolved import ${specifier} in ${rel(file)}`);
      }
    }
  }
  return { modules, boundaries, clientRuntimeImporters };
};

describe('rsc environment does not statically load the RSC client runtime', () => {
  test.for(RSC_ENTRIES)('%s', (entry) => {
    expect([...walkStaticGraph(entry).clientRuntimeImporters]).toEqual([]);
  });

  // Without these, the suite above would still pass if the walk silently stopped
  // traversing. `server.ts` holds the lazy `import()` of the client runtime, so
  // reaching it proves the guard inspects the module that would regress first.
  test('the walk reaches the modules that would regress first', () => {
    const router = walkStaticGraph('router/server.ts');
    expect(router.modules).toContain(
      'router/define-router-utils/element-cache.ts',
    );
    expect(router.modules).toContain('server.ts');

    expect(walkStaticGraph('adapter-builders.ts').modules).toContain(
      'lib/vite-rsc/handler.ts',
    );
  });

  test('self-imports are followed and client boundaries are not', () => {
    const { modules, boundaries } = walkStaticGraph('main.react-server.ts');
    // Reached via `waku/router/server` and `waku/server`.
    expect(modules).toContain('router/define-router.tsx');
    expect(modules).toContain('server.ts');
    // `waku/router/client` is a `'use client'` module, so the walk stops there.
    expect(boundaries).toContain('router/client.tsx');
  });

  test('a static client runtime import would be detected', () => {
    // Guards the matcher itself: `server.ts` defers the decoder, so turning that
    // dynamic import back into a static one must fail the assertions above.
    const source = fs.readFileSync(path.join(SRC, 'server.ts'), 'utf8');
    expect(source).toContain('await import(');
    expect(source).toContain('react-server-dom-webpack/client.edge');
    expect([...walkStaticGraph('server.ts').clientRuntimeImporters]).toEqual(
      [],
    );
  });
});
