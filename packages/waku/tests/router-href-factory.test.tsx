/** @vitest-environment happy-dom */

import { act } from 'react';
import type { ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  test,
  vi,
} from 'vitest';
import { RouterHostContext } from '../src/router/client-core-utils/host.js';
import type { RouterHost } from '../src/router/client-core-utils/host.js';
import {
  useSearch_UNSTABLE,
  useSetSearch_UNSTABLE,
} from '../src/router/client-core-utils/search.js';
import { unstable_createRouteHref } from '../src/router/href-factory.js';

type Search = { page: number; tag: string };
type SetSearch = ReturnType<typeof useSetSearch_UNSTABLE<string, Search>>;

const codec = {
  parse: (query: string): Search => {
    const params = new URLSearchParams(query);
    const page = params.has('page') ? Number(params.get('page')) : 1;
    if (!Number.isInteger(page) || page < 1) {
      throw new Error('Invalid page');
    }
    return { page, tag: params.get('tag') ?? '' };
  },
  serialize: (search: Search) =>
    new URLSearchParams({
      page: String(search.page),
      tag: search.tag,
    }).toString(),
};

const product = unstable_createRouteHref({
  path: '/products/[id]',
  search: codec,
});

describe('locally typed href factories', () => {
  test('encodes params and search without a codec id, provider, or registry', () => {
    const target = product({
      params: { id: 'a b/c' },
      search: { page: 2, tag: 'new & used' },
      hash: '#details',
    });
    expect(target).toBe('/products/a%20b%2Fc?page=2&tag=new+%26+used#details');
  });

  test('serializes eagerly without parsing, returning a primitive href', () => {
    const parse = vi.fn(codec.parse);
    const serialize = vi.fn(codec.serialize);
    const route = unstable_createRouteHref({
      path: '/products/[id]',
      search: { parse, serialize },
    });
    expect(route({ params: { id: '42' }, search: { page: -1, tag: '' } })).toBe(
      '/products/42?page=-1&tag=',
    );
    expect(serialize).toHaveBeenCalledTimes(1);
    expect(parse).not.toHaveBeenCalled();
    const href = route({
      params: { id: '42' },
      search: { page: 2, tag: 'new' },
    });
    expect(typeof href).toBe('string');
    expect(href).toBe('/products/42?page=2&tag=new');
    expect(serialize).toHaveBeenCalledTimes(2);
    expect(parse).not.toHaveBeenCalled();
  });

  test('omits the query without calling the codec when search is omitted', () => {
    expect(product({ params: { id: '42' } })).toBe('/products/42');
    const parse = vi.fn(() => {
      throw new Error('Missing page');
    });
    const serialize = vi.fn(codec.serialize);
    const required = unstable_createRouteHref({
      path: '/required',
      search: { parse, serialize },
    });
    expect(required()).toBe('/required');
    expect(parse).not.toHaveBeenCalled();
    expect(serialize).not.toHaveBeenCalled();
  });

  test('builds parameter-only routes without a codec', () => {
    const post = unstable_createRouteHref({ path: '/posts/[id]' });
    expect(post({ params: { id: 'a b' }, hash: 'comments' })).toBe(
      '/posts/a%20b#comments',
    );
    const home = unstable_createRouteHref({ path: '/' });
    expect(home({})).toBe('/');
    expect(post.searchCodec).toBeUndefined();
    expect(home()).toBe('/');
  });

  test('normalizes empty and group segments before constructing the href', () => {
    const about = unstable_createRouteHref({
      path: '/(site)//about/(details)/',
    });
    expect(about({})).toBe('/about');
    const docs = unstable_createRouteHref({
      path: '/docs/[...parts]/overview',
    });
    expect(docs({ params: { parts: [] } })).toBe('/docs/overview');
  });

  test('preserves group, slug, and catch-all matcher checks', () => {
    const route = unstable_createRouteHref({
      path: '/(catalog)/@[name]/[...parts]',
      search: codec,
    });
    expect(route({ params: { name: 'a/b', parts: ['one two', '%'] } })).toBe(
      '/@a%2Fb/one%20two/%25',
    );
    expect(() => route({ params: { name: 'a', parts: [] } })).toThrow(
      /Cannot build/,
    );
    // @ts-expect-error runtime callers can omit required params
    expect(() => product({})).toThrow(/Missing param/);
    // @ts-expect-error runtime callers can supply a non-string slug
    expect(() => product({ params: { id: 42 } })).toThrow(/Missing param/);
    const root = unstable_createRouteHref({
      path: '/[...parts]',
      search: codec,
    });
    expect(root({ params: { parts: [] } })).toBe('/');
  });

  test('rejects empty catch-all members that would produce a scheme-relative href', () => {
    const route = unstable_createRouteHref({ path: '/[...parts]' });
    expect(() => route({ params: { parts: ['', 'evil.example'] } })).toThrow(
      /catch-all param/,
    );
  });

  test('rejects empty catch-all members within a prefixed route', () => {
    const docs = unstable_createRouteHref({ path: '/docs/[...parts]' });
    expect(() =>
      docs({ params: { parts: ['guides', '', 'routing'] } }),
    ).toThrow(/catch-all param/);
  });

  test('leaves raw-input validation to the serializer', () => {
    const parse = vi.fn(codec.parse);
    const lossy = unstable_createRouteHref({
      path: '/lossy',
      search: {
        parse,
        serialize: (search: Search) =>
          codec.serialize({
            ...search,
            page: Math.max(1, Number(search.page) || 1),
          }),
      },
    });
    // @ts-expect-error the serializer can hide a runtime input type error
    expect(lossy({ search: { page: 'bad', tag: '' } })).toBe(
      '/lossy?page=1&tag=',
    );
    expect(parse).not.toHaveBeenCalled();
    const strict = unstable_createRouteHref({
      path: '/strict',
      search: {
        ...codec,
        serialize: (search: Search) => {
          if (!Number.isInteger(search.page) || search.page < 1) {
            throw new Error('Invalid raw page');
          }
          return codec.serialize(search);
        },
      },
    });
    expect(() =>
      // @ts-expect-error raw validation belongs in the serializer
      strict({ search: { page: 'bad', tag: '' } }),
    ).toThrow('Invalid raw page');
  });

  test('rejects completed dot segments without rejecting encoded or prefixed values', () => {
    const post = unstable_createRouteHref({ path: '/products/[id]' });
    const docs = unstable_createRouteHref({ path: '/docs/[...parts]' });
    for (const id of ['.', '..']) {
      expect(() => post({ params: { id } })).toThrow(/dot-segment/);
      expect(() => docs({ params: { parts: ['a', id, 'b'] } })).toThrow(
        /dot-segment/,
      );
    }
    const prefixed = unstable_createRouteHref({ path: '/@[id]' });
    expect(prefixed({ params: { id: '..' } })).toBe('/@..');
    for (const id of ['a/..', '%2e%2e', 'a.b']) {
      const href = post({ params: { id } });
      expect(new URL(href, 'http://localhost').pathname).toBe(href);
    }
  });

  test('preserves serialized encoding without parsing or applying defaults', () => {
    const parse = vi.fn(codec.parse);
    const route = unstable_createRouteHref({
      path: '/query',
      search: { parse, serialize: () => 'tag=a%20b' },
    });
    expect(route({ search: { page: 2, tag: '' } })).toBe('/query?tag=a%20b');
    expect(parse).not.toHaveBeenCalled();
  });
});

const roots: ReturnType<typeof createRoot>[] = [];

const render = async (element: ReactElement) => {
  const root = createRoot(document.createElement('div'));
  roots.push(root);
  const rerender = async (next: ReactElement) => {
    await act(async () => root.render(next));
  };
  await rerender(element);
  return rerender;
};

beforeAll(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  vi.stubEnv('WAKU_CONFIG_BASE_PATH', '/base/');
  window.history.replaceState({}, '', '/base/unrelated?page=99#from-window');
});

afterEach(() => {
  act(() => {
    for (const root of roots.splice(0)) {
      root.unmount();
    }
  });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

afterAll(() => {
  delete (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT;
});

describe('typed search over RouterHost', () => {
  test('memoizes inline descriptors by path and codec', async () => {
    const parse = vi.fn(codec.parse);
    const searchCodec = { ...codec, parse };
    const host: RouterHost = {
      route: { path: '/products/42', query: 'page=2', hash: '' },
      navigate: vi.fn<RouterHost['navigate']>().mockResolvedValue(),
    };
    let search: Search | null = null;
    let setSearch!: SetSearch;
    const Probe = ({ codec = searchCodec }) => {
      search = useSearch_UNSTABLE({
        path: '/products/[id]',
        searchCodec: codec,
      });
      setSearch = useSetSearch_UNSTABLE({
        path: '/products/[id]',
        searchCodec: codec,
      });
      return null;
    };
    const rerender = await render(
      <RouterHostContext value={host}>
        <Probe />
      </RouterHostContext>,
    );
    const firstSearch = search;
    const firstSetter = setSearch;
    await rerender(
      <RouterHostContext value={host}>
        <Probe />
      </RouterHostContext>,
    );
    expect(search).toBe(firstSearch);
    expect(setSearch).toBe(firstSetter);
    expect(parse).toHaveBeenCalledExactlyOnceWith('page=2');

    const nextCodec = { ...codec, parse: vi.fn(() => ({ page: 3, tag: '' })) };
    await rerender(
      <RouterHostContext value={host}>
        <Probe codec={nextCodec} />
      </RouterHostContext>,
    );
    expect(search).toEqual({ page: 3, tag: '' });
    expect(setSearch).not.toBe(firstSetter);
    await setSearch({ tag: 'next' });
    expect(host.navigate).toHaveBeenCalledWith(
      '/base/products/42?page=3&tag=next',
      { history: 'push', scroll: false },
    );
  });

  test('updates a structural route descriptor without rebuilding the path', async () => {
    const parse = vi.fn(codec.parse);
    const serialize = vi.fn(() => 'tag=a%20b');
    const route = {
      path: '/products/[id]',
      searchCodec: { parse, serialize },
    };
    const navigate = vi.fn<RouterHost['navigate']>().mockResolvedValue();
    let search: Search | null = null;
    let setSearch!: SetSearch;
    const Probe = () => {
      search = useSearch_UNSTABLE(route);
      setSearch = useSetSearch_UNSTABLE(route);
      return null;
    };
    await render(
      <RouterHostContext
        value={{
          route: { path: '/products/a%2Fb', query: 'page=2', hash: '#details' },
          navigate,
        }}
      >
        <Probe />
      </RouterHostContext>,
    );
    expect(search).toEqual({ page: 2, tag: '' });
    await setSearch({ tag: 'a b' });
    expect(serialize).toHaveBeenCalledWith({ page: 2, tag: 'a b' });
    expect(parse).toHaveBeenCalledTimes(2);
    expect(parse).toHaveBeenLastCalledWith('page=2');
    expect(navigate).toHaveBeenCalledWith(
      '/base/products/a%2Fb?tag=a%20b#details',
      { history: 'push', scroll: false },
    );
  });

  test('reads host state and preserves encoded path, base, hash, history, and scroll', async () => {
    const navigate = vi.fn<RouterHost['navigate']>().mockResolvedValue();
    const host: RouterHost = {
      route: {
        path: '/products/a%2Fb',
        query: 'page=2&tag=kept',
        hash: '#details',
      },
      navigate,
    };
    let search: Search | null = null;
    let setSearch!: SetSearch;
    const Probe = () => {
      search = useSearch_UNSTABLE(product);
      setSearch = useSetSearch_UNSTABLE(product);
      return null;
    };
    const rerender = await render(
      <RouterHostContext value={host}>
        <Probe />
      </RouterHostContext>,
    );
    expect(search).toEqual({ page: 2, tag: 'kept' });
    await setSearch((prev) => ({ page: prev.page + 1 }));
    expect(navigate).toHaveBeenLastCalledWith(
      '/base/products/a%2Fb?page=3&tag=kept#details',
      { history: 'push', scroll: false },
    );
    await rerender(
      <RouterHostContext
        value={{
          ...host,
          route: { ...host.route, query: 'page=4&tag=next', hash: '#next' },
        }}
      >
        <Probe />
      </RouterHostContext>,
    );
    expect(search).toEqual({ page: 4, tag: 'next' });
    await setSearch({ page: 5 }, { history: 'replace', scroll: true });
    expect(navigate).toHaveBeenLastCalledWith(
      '/base/products/a%2Fb?page=5&tag=next#next',
      { history: 'replace', scroll: true },
    );
  });

  test('returns null and does not parse or update on a mismatched path', async () => {
    const parse = vi.fn(codec.parse);
    const route = unstable_createRouteHref({
      path: '/products/[id]',
      search: { ...codec, parse },
    });
    const navigate = vi.fn<RouterHost['navigate']>().mockResolvedValue();
    let search: Search | null = null;
    let setSearch!: SetSearch;
    const Probe = () => {
      search = useSearch_UNSTABLE(route);
      setSearch = useSetSearch_UNSTABLE(route);
      return null;
    };
    await render(
      <RouterHostContext
        value={{
          route: { path: '/elsewhere', query: 'page=bad', hash: '' },
          navigate,
        }}
      >
        <Probe />
      </RouterHostContext>,
    );
    const update = vi.fn(() => ({ page: 2 }));
    await setSearch(update);
    expect(search).toBeNull();
    expect(parse).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(navigate).not.toHaveBeenCalled();
  });

  test('propagates serializer and navigation errors', async () => {
    const strictProduct = unstable_createRouteHref({
      path: '/products/[id]',
      search: {
        ...codec,
        serialize: (search: Search) => {
          if (!Number.isInteger(search.page) || search.page < 1) {
            throw new Error('Invalid page');
          }
          return codec.serialize(search);
        },
      },
    });
    const navigate = vi.fn<RouterHost['navigate']>().mockResolvedValue();
    let setSearch!: SetSearch;
    const Probe = () => {
      setSearch = useSetSearch_UNSTABLE(strictProduct);
      return null;
    };
    await render(
      <RouterHostContext
        value={{
          route: { path: '/products/42', query: 'page=1', hash: '' },
          navigate,
        }}
      >
        <Probe />
      </RouterHostContext>,
    );
    await expect(setSearch({ page: -1 })).rejects.toThrow('Invalid page');
    expect(navigate).not.toHaveBeenCalled();
    navigate.mockRejectedValueOnce(new Error('Navigation failed'));
    await expect(setSearch({ page: 2 })).rejects.toThrow('Navigation failed');
  });

  test("parses the current query but not a parse-only codec's serialized update", async () => {
    const parse = vi.fn(codec.parse);
    const route = unstable_createRouteHref({
      path: '/products/[id]',
      search: { ...codec, parse },
    });
    const navigate = vi.fn<RouterHost['navigate']>().mockResolvedValue();
    let setSearch!: SetSearch;
    const Probe = () => {
      setSearch = useSetSearch_UNSTABLE(route);
      return null;
    };
    await render(
      <RouterHostContext
        value={{
          route: { path: '/products/42', query: 'page=1', hash: '' },
          navigate,
        }}
      >
        <Probe />
      </RouterHostContext>,
    );
    await setSearch({ page: -1 });
    expect(parse).toHaveBeenCalledExactlyOnceWith('page=1');
    expect(navigate).toHaveBeenCalledWith('/base/products/42?page=-1&tag=', {
      history: 'push',
      scroll: false,
    });
  });

  test('isolates sibling hosts without a codec provider', async () => {
    const searches: (Search | null)[] = [];
    const setters: SetSearch[] = [];
    const Probe = ({ index }: { index: number }) => {
      searches[index] = useSearch_UNSTABLE(product);
      setters[index] = useSetSearch_UNSTABLE(product);
      return null;
    };
    const first = vi.fn<RouterHost['navigate']>().mockResolvedValue();
    const second = vi.fn<RouterHost['navigate']>().mockResolvedValue();
    await render(
      <>
        <RouterHostContext
          value={{
            route: { path: '/products/1', query: 'page=1', hash: '#one' },
            navigate: first,
          }}
        >
          <Probe index={0} />
        </RouterHostContext>
        <RouterHostContext
          value={{
            route: { path: '/products/2', query: 'page=2', hash: '#two' },
            navigate: second,
          }}
        >
          <Probe index={1} />
        </RouterHostContext>
      </>,
    );
    expect(searches).toEqual([
      { page: 1, tag: '' },
      { page: 2, tag: '' },
    ]);
    await setters[1]!({ page: 3 });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith('/base/products/2?page=3&tag=#two', {
      history: 'push',
      scroll: false,
    });
  });
});
