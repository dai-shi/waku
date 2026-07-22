import { expect, test } from 'vitest';
import { patchRsdwPlugin } from '../src/lib/vite-plugins/patch-rsdw.js';

const DEVELOPMENT_ID =
  '/tmp/react-server-dom-webpack-client.browser.development.js';

const runTransform = async (code: string, id = DEVELOPMENT_ID) => {
  const plugin = patchRsdwPlugin();
  if (typeof plugin.transform !== 'function') {
    throw new Error('Plugin transform is not defined');
  }
  return plugin.transform.call({} as never, code, id);
};

const runResolve = async (source: string, importer?: string) => {
  const plugin = patchRsdwPlugin();
  if (typeof plugin.resolveId !== 'function') {
    throw new Error('Plugin resolveId is not defined');
  }
  return plugin.resolveId.call({} as never, source, importer, {} as never);
};

const runLoad = async (source: string, environmentName: string) => {
  const plugin = patchRsdwPlugin();
  if (typeof plugin.load !== 'function') {
    throw new Error('Plugin load is not defined');
  }
  return plugin.load.call(
    { environment: { name: environmentName } } as never,
    '\0' + source,
  );
};

test('patches the browser client bundle with the debugInfo fallback', async () => {
  const output = await runTransform(`\
function flushComponentPerformance(response, root) {
  let debugInfo = root._debugInfo;
  if (debugInfo) {
    return debugInfo.length;
  }
}
`);

  expect(output).toContain('resolveLazy(root.value)');
  expect(output).toContain('_resolved._debugInfo');
  expect(output).toContain('"fulfilled" === root.status');
});

test('skips unrelated files', async () => {
  const output = await runTransform(
    'let debugInfo = root._debugInfo;',
    '/tmp/unrelated.js',
  );
  expect(output).toBeUndefined();
});

test('rewrites RSDW client imports to the Vite browser helper', async () => {
  await expect(
    runResolve('react-server-dom-webpack/client', '/tmp/app.tsx'),
  ).resolves.toBe('\0react-server-dom-webpack/client');
  await expect(
    runLoad('react-server-dom-webpack/client', 'client'),
  ).resolves.toContain('@vitejs/plugin-rsc/dist/browser.js');
  await expect(runLoad('react-server-dom-webpack/client', 'ssr')).resolves.toBe(
    'export default {}',
  );
});

test('rewrites RSDW edge imports to Vite RSC wrappers', async () => {
  await expect(
    runResolve('react-server-dom-webpack/client.edge', '/tmp/app.ts'),
  ).resolves.toBe('\0react-server-dom-webpack/client.edge');
  await expect(
    runResolve(
      'react-server-dom-webpack/client.edge',
      '/tmp/node_modules/@vitejs/plugin-rsc/dist/react/rsc.js',
    ),
  ).resolves.toBeUndefined();
  await expect(
    runResolve('react-server-dom-webpack/server.edge', '/tmp/app.ts'),
  ).resolves.toBe('\0react-server-dom-webpack/server.edge');
  await expect(
    runResolve(
      'react-server-dom-webpack/server.edge',
      '/tmp/node_modules/@vitejs/plugin-rsc/dist/react/rsc.js',
    ),
  ).resolves.toBeUndefined();
  await expect(
    runLoad('react-server-dom-webpack/client.edge', 'rsc'),
  ).resolves.toContain('createFromReadableStreamBase');
  await expect(
    runLoad('react-server-dom-webpack/client.edge', 'rsc'),
  ).resolves.toContain('@vitejs/plugin-rsc/dist/react/rsc/client.js');
  await expect(
    runLoad('react-server-dom-webpack/server.edge', 'rsc'),
  ).resolves.toContain('renderToReadableStreamBase');
  await expect(
    runLoad('react-server-dom-webpack/server.edge', 'rsc'),
  ).resolves.toContain('renderToReadableStream(model, _webpackMap, options)');
  await expect(
    runLoad('react-server-dom-webpack/server.edge', 'rsc'),
  ).resolves.not.toContain('registerClientReference');
  await expect(
    runLoad('react-server-dom-webpack/server.edge', 'rsc'),
  ).resolves.toContain('@vitejs/plugin-rsc/dist/react/rsc/server.js');
  await expect(
    runLoad('react-server-dom-webpack/client.edge', 'client'),
  ).resolves.toBe('export {}');
  await expect(
    runLoad('react-server-dom-webpack/server.edge', 'client'),
  ).resolves.toBe('export {}');
});
