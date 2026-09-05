import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { patchReactDomPlugin } from '../src/lib/vite-plugins/patch-react-dom.js';

const require = createRequire(import.meta.url);

const runTransform = async (code: string, id: string) => {
  const plugin = patchReactDomPlugin();
  if (typeof plugin.transform !== 'function') {
    throw new Error('Plugin transform is not defined');
  }
  return plugin.transform.call({} as never, code, id);
};

test('patches the optimized React DOM client', async () => {
  const output = await runTransform(
    '(hoistableRoot = resource.state.preload) && check();',
    '/tmp/react-dom_client.js?v=123',
  );
  expect(output).toContain(
    '(hoistableRoot = resource.state.preload) && hoistableRoot.isConnected &&',
  );
});

test.each(['development', 'production'])(
  'patches the installed React DOM %s client',
  async (mode) => {
    const packagePath = require.resolve('react-dom/package.json');
    const id = join(dirname(packagePath), 'cjs', `react-dom-client.${mode}.js`);
    const code = readFileSync(id, 'utf8');
    const output = await runTransform(code, id);
    expect(output).toContain(
      '(hoistableRoot = resource.state.preload) && hoistableRoot.isConnected &&',
    );
  },
);

const PING_PATCHED =
  '? prepareFreshStack(root, 0) : (workInProgressRootPingedLanes |= pingedLanes)';

// wakujs/waku#2288
test('records a ping that arrives during a render in the optimized client', async () => {
  const output = await runTransform(
    '? (executionContext & RenderContext) === NoContext && prepareFreshStack(root, 0) : workInProgressRootPingedLanes |= pingedLanes,',
    '/tmp/react-dom_client.js?v=123',
  );
  expect(output).toContain(PING_PATCHED);
});

test.each(['development', 'production'])(
  'records a ping that arrives during a render in the installed %s client',
  async (mode) => {
    const packagePath = require.resolve('react-dom/package.json');
    const id = join(dirname(packagePath), 'cjs', `react-dom-client.${mode}.js`);
    const code = readFileSync(id, 'utf8');
    const output = await runTransform(code, id);
    expect(output).toContain(PING_PATCHED);
    expect(output).not.toContain('&& prepareFreshStack(root, 0)');
  },
);

test('leaves a React that already records the pinged lanes alone', async () => {
  const output = await runTransform(
    `? (executionContext & RenderContext) === NoContext
      ? prepareFreshStack(root, 0)
      : (workInProgressRootPingedLanes |= pingedLanes)
    : (workInProgressRootPingedLanes |= pingedLanes),`,
    '/tmp/react-dom_client.js',
  );
  expect(output).toBeUndefined();
});

test('skips unrelated files', async () => {
  const output = await runTransform(
    '(hoistableRoot = resource.state.preload) && check();',
    '/tmp/unrelated.js',
  );
  expect(output).toBeUndefined();
});
