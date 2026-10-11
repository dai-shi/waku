import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { getErrorInfo } from '../src/lib/utils-isomorphic/custom-errors.js';
import type { Unstable_SearchCodec } from '../src/router/base-types.js';
import { parseRoute } from '../src/router/client-core-utils/route-url.js';
import { createPages } from '../src/router/create-pages.js';
import { unstable_defineRouter } from '../src/router/define-router.js';
import { unstable_createRouteHref } from '../src/router/href-factory.js';

type Search = { q: string; page: number };

const codec = {
  parse: (query: string): Search => {
    const params = new URLSearchParams(query);
    const page = params.has('page') ? Number(params.get('page')) : 1;
    if (!Number.isInteger(page) || page < 1) {
      throw new Error('Invalid page');
    }
    return { q: params.get('q') ?? '', page };
  },
  serialize: (search: Search) =>
    new URLSearchParams({ q: search.q, page: String(search.page) }).toString(),
} satisfies Unstable_SearchCodec<Search>;

vi.mock('../src/server.js', () => ({
  deserializeRsc: vi.fn().mockResolvedValue(null),
  serializeRsc: vi.fn().mockResolvedValue(new Uint8Array([1])),
}));

const makeRequestUtils = () => ({
  renderRsc: vi.fn().mockResolvedValue(new ReadableStream<Uint8Array>()),
  parseRsc: vi.fn(),
  renderHtml: vi.fn().mockResolvedValue(new Response('ok')),
  renderHtmlFallback: vi.fn().mockResolvedValue(new Response('fallback')),
  loadBuildMetadata: vi.fn().mockResolvedValue(undefined),
});

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('outbound serialization and inbound parsing', () => {
  test.each(['development', 'production'])(
    'serializes without parsing in %s',
    (mode) => {
      vi.stubEnv('MODE', mode);
      vi.stubEnv('DEV', mode === 'development');
      vi.stubEnv('PROD', mode === 'production');
      const searchCodec = {
        parse: vi.fn(codec.parse),
        serialize: vi.fn(codec.serialize),
      };
      const href = unstable_createRouteHref({
        path: '/products',
        search: searchCodec,
      });
      expect(href({ search: { q: 'camera', page: -1 } })).toBe(
        '/products?q=camera&page=-1',
      );
      expect(searchCodec.serialize).toHaveBeenCalledExactlyOnceWith({
        q: 'camera',
        page: -1,
      });
      expect(searchCodec.parse).not.toHaveBeenCalled();
    },
  );

  test('preserves serialized encoding while incoming URLs use normalized queries', async () => {
    const search = { q: 'a b', page: 1 };
    const encodedCodec = {
      parse: vi.fn(codec.parse),
      serialize: (_search: Search) => 'q=a%20b&tag=one&tag=two&token=%7e&empty',
    };
    const href = unstable_createRouteHref({
      path: '/products',
      search: encodedCodec,
    });
    const query = encodedCodec.serialize(search);
    const target = href({ search, hash: 'results' });
    const normalizedQuery = 'q=a+b&tag=one&tag=two&token=%7E&empty=';

    expect(target).toBe('/products?' + query + '#results');
    expect(encodedCodec.parse).not.toHaveBeenCalled();
    expect(parseRoute(new URL(target, 'http://localhost'))).toEqual({
      path: '/products',
      query: normalizedQuery,
      hash: '#results',
    });

    const resolve = vi.fn(async () => null);
    const router = unstable_defineRouter({
      resolve,
      getHas404: async () => false,
    });
    await router.handleRequest(
      {
        type: 'http',
        pathname: '/products',
        req: new Request(new URL(target, 'http://localhost')),
      },
      makeRequestUtils(),
    );
    expect(resolve).toHaveBeenCalledExactlyOnceWith(
      '/products',
      normalizedQuery,
    );
  });

  test.each(['invalid search', 'omitted search', 'inconsistent serializer'])(
    'rejects %s on the destination request, not during href construction',
    async (scenario) => {
      const searchCodec = {
        parse: vi.fn((query: string) => {
          if (!new URLSearchParams(query).has('page')) {
            throw new Error('Missing page');
          }
          return codec.parse(query);
        }),
        serialize: vi.fn((search: Search) =>
          scenario === 'inconsistent serializer'
            ? 'q=camera&page=bad'
            : codec.serialize(search),
        ),
      };
      const href = unstable_createRouteHref({
        path: '/products',
        search: searchCodec,
      });
      const router = createPages(async ({ createPage }) => [
        createPage({
          path: '/products',
          render: 'dynamic',
          component: () => null,
          unstable_searchCodec: searchCodec,
        }),
      ]);
      const target =
        scenario === 'omitted search'
          ? href()
          : href({
              search: {
                q: 'camera',
                page: scenario === 'invalid search' ? -1 : 2,
              },
            });
      expect(searchCodec.parse).not.toHaveBeenCalled();
      expect(searchCodec.serialize).toHaveBeenCalledTimes(
        scenario === 'omitted search' ? 0 : 1,
      );
      const utils = makeRequestUtils();
      const error: unknown = await router
        .handleRequest(
          {
            type: 'http',
            pathname: '/products',
            req: new Request(new URL(target, 'http://localhost')),
          },
          utils,
        )
        .catch((cause: unknown) => cause);
      expect(getErrorInfo(error)?.status).toBe(400);
      expect(error).toMatchObject({
        cause: new Error(
          scenario === 'omitted search' ? 'Missing page' : 'Invalid page',
        ),
      });
      expect(searchCodec.parse).toHaveBeenCalledExactlyOnceWith(
        new URL(target, 'http://localhost').searchParams.toString(),
      );
      expect(utils.renderRsc).not.toHaveBeenCalled();
      expect(utils.renderHtml).not.toHaveBeenCalled();
    },
  );

  test('parses valid search only when the destination request arrives', async () => {
    const searchCodec = {
      parse: vi.fn(codec.parse),
      serialize: vi.fn(codec.serialize),
    };
    const href = unstable_createRouteHref({
      path: '/products',
      search: searchCodec,
    });
    const router = createPages(async ({ createPage }) => [
      createPage({
        path: '/products',
        render: 'dynamic',
        component: () => null,
        unstable_searchCodec: searchCodec,
      }),
    ]);
    const target = href({ search: { q: 'camera', page: 2 } });
    expect(searchCodec.parse).not.toHaveBeenCalled();
    const utils = makeRequestUtils();
    await router.handleRequest(
      {
        type: 'http',
        pathname: '/products',
        req: new Request(new URL(target, 'http://localhost')),
      },
      utils,
    );
    expect(searchCodec.parse).toHaveBeenCalledExactlyOnceWith(
      'q=camera&page=2',
    );
    expect(utils.renderHtml).toHaveBeenCalledOnce();
  });
});
