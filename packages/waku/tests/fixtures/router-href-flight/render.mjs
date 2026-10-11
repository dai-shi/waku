import { createElement } from 'react';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import process from 'node:process';
import { text } from 'node:stream/consumers';
import { URLSearchParams } from 'node:url';
import {
  createClientModuleProxy,
  renderToReadableStream,
} from 'react-server-dom-webpack/server.edge';

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (specifier.startsWith('.') && specifier.endsWith('.js')) {
        return nextResolve(specifier.slice(0, -3) + '.ts', context);
      }
      throw error;
    }
  },
});

const { unstable_createRouteHref } =
  await import('../../../src/router/base-types.ts');
const { Link } = createClientModuleProxy('waku/router/client');
const { ClientNavigation } = createClientModuleProxy(
  'router-href-flight/client',
);
const productHref = unstable_createRouteHref({
  path: '/products/[id]',
  search: {
    parse: (query) => {
      const params = new URLSearchParams(query);
      const page = Number(params.get('page'));
      if (!Number.isInteger(page) || page < 1) {
        throw new Error('Invalid page');
      }
      return { page, tag: params.get('tag') ?? '' };
    },
    serialize: (search) =>
      new URLSearchParams({
        page: String(search.page),
        tag: search.tag,
      }).toString(),
  },
});
const href = productHref({
  params: { id: 'a b/c' },
  search: { page: 2, tag: 'new & used' },
  hash: '#details',
});
const errors = [];
const stream = renderToReadableStream(
  ['/products/plain?page=invalid#plain', href].map((destination, index) =>
    createElement(ClientNavigation, {
      key: String(index),
      component: Link,
      destination,
    }),
  ),
  {
    'waku/router/client#Link': {
      id: 'waku/router/client',
      chunks: [],
      name: 'Link',
    },
    'router-href-flight/client#ClientNavigation': {
      id: 'router-href-flight/client',
      chunks: [],
      name: 'ClientNavigation',
    },
  },
  {
    onError: (error) => {
      errors.push(error);
      return 'flight-error';
    },
  },
);
const payload = await text(stream);
assert.deepEqual(errors, []);
process.stdout.write(payload);
