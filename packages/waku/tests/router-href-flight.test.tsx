import type { ReactElement } from 'react';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test, vi } from 'vitest';
import { unstable_createRouteHref } from '../src/router/base-types.js';
import { Link } from '../src/router/client.js';
import type { LinkProps } from '../src/router/client.js';

type NavigationProps = {
  component: typeof Link;
  destination: LinkProps['to'];
};

const { createFromReadableStream } = createRequire(import.meta.url)(
  'react-server-dom-webpack/client.edge',
) as {
  createFromReadableStream: (
    stream: ReadableStream,
    options: unknown,
  ) => PromiseLike<ReactElement<NavigationProps>[]>;
};

const ClientNavigation = ({
  component: Component,
  destination,
}: NavigationProps) => <Component to={destination}>Product</Component>;

test('Flight composes the public Link reference with plain and eager href props', async () => {
  const result = spawnSync(
    process.execPath,
    [
      '--conditions=react-server',
      '--experimental-strip-types',
      fileURLToPath(
        new URL('./fixtures/router-href-flight/render.mjs', import.meta.url),
      ),
    ],
    { encoding: 'utf8', timeout: 10000 },
  );
  expect(result.error).toBeUndefined();
  expect(result.status, result.stderr).toBe(0);

  const modules = new Map<string, unknown>([
    ['waku/router/client', { Link }],
    ['router-href-flight/client', { ClientNavigation }],
  ]);
  // Flight's webpack decoder resolves these registered exports on the client.
  vi.stubGlobal('__webpack_require__', (id: string) => {
    if (!modules.has(id)) {
      throw new Error(`Unknown client module: ${id}`);
    }
    return modules.get(id);
  });
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
  try {
    const decoded = await createFromReadableStream(
      new Response(result.stdout).body!,
      {
        serverConsumerManifest: {
          moduleMap: {
            'waku/router/client': {
              Link: { id: 'waku/router/client', chunks: [], name: 'Link' },
            },
            'router-href-flight/client': {
              ClientNavigation: {
                id: 'router-href-flight/client',
                chunks: [],
                name: 'ClientNavigation',
              },
            },
          },
          moduleLoading: null,
          serverModuleMap: null,
        },
      },
    );
    expect(decoded).toHaveLength(2);
    expect(decoded.map(({ props }) => props.destination)).toEqual([
      '/products/plain?page=invalid#plain',
      '/products/a%20b%2Fc?page=2&tag=new+%26+used#details',
    ]);
    for (const { props } of decoded) {
      expect(typeof props.destination).toBe('string');
      expect(props.component).toBe(Link);
    }
    expect(renderToStaticMarkup(<div>{decoded}</div>)).toBe(
      '<div><a href="/products/plain?page=invalid#plain">Product</a>' +
        '<a href="/products/a%20b%2Fc?page=2&amp;tag=new+%26+used#details">Product</a></div>',
    );
  } finally {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  }
}, 15000);

test('serializer errors propagate before creating navigation', () => {
  const productHref = unstable_createRouteHref({
    path: '/products/[id]',
    search: {
      parse: (query: string) => {
        const page = Number(new URLSearchParams(query).get('page'));
        if (!Number.isInteger(page) || page < 1) {
          throw new Error('Invalid page');
        }
        return { page };
      },
      serialize: (search: { page: number }) => {
        if (!Number.isInteger(search.page) || search.page < 1) {
          throw new Error('Invalid page');
        }
        return new URLSearchParams({ page: String(search.page) }).toString();
      },
    },
  });
  const createNavigation = vi.fn((destination: LinkProps['to']) => (
    <ClientNavigation component={Link} destination={destination} />
  ));
  expect(() =>
    createNavigation(
      productHref({ params: { id: '42' }, search: { page: 0 } }),
    ),
  ).toThrow('Invalid page');
  expect(createNavigation).not.toHaveBeenCalled();
});
