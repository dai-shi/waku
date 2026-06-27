import type { PropsWithChildren, ReactNode } from 'react';
import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MockedFunction } from 'vitest';
import { getErrorInfo } from '../src/lib/utils/custom-errors.js';
import { parsePathWithSlug } from '../src/lib/utils/path.js';
import { Children } from '../src/minimal/client.js';
import type { PathsForPages } from '../src/router/base-types.js';
import type { GetSlugs } from '../src/router/create-pages-utils/inferred-path-types.js';
import {
  createPages,
  pathMappingWithoutGroups,
} from '../src/router/create-pages.js';
import type {
  CreateApi,
  CreateLayout,
  CreatePage,
  CreateSlice,
  HasSlugInPath,
  HasWildcardInPath,
  IsValidPathInSlugPath,
  PathWithSlug,
  PathWithWildcard,
  PathWithoutSlug,
  StaticSlugRoutePathsTuple,
} from '../src/router/create-pages.js';
import { unstable_defineRouter } from '../src/router/define-router.js';

function Fake() {
  return null;
}
const complexTestRouter = (fn: typeof createPages, component = Fake) => {
  return fn(async ({ createPage }) => {
    // Dynamic pages
    const dynamicNoSlug = createPage({
      render: 'dynamic',
      path: '/client/dynamic',
      component,
    });
    const dynamicOneSlugPage = createPage({
      render: 'dynamic',
      path: '/server/one/[echo]',
      component,
    });
    const dynamicTwoSlugPage = createPage({
      render: 'dynamic',
      path: '/server/two/[echo]/[echo2]',
      component,
    });
    const dynamicWildcardPage = createPage({
      render: 'dynamic',
      path: '/server/wild/[...wild]',
      component,
    });
    const dynamicSlugAndWildcardPage = createPage({
      render: 'dynamic',
      path: '/server/oneAndWild/[slug]/[...wild]',
      component,
    });

    // Static pages
    const staticNoSlug = createPage({
      render: 'static',
      path: '/client/static',
      component,
    });
    const staticOneSlugPage = createPage({
      render: 'static',
      path: '/server/static/[echo]',
      staticPaths: ['static-echo', 'static-echo-2'] as const,
      component,
    });
    const staticTwoSlugPage = createPage({
      render: 'static',
      path: '/server/static/[echo]/[echo2]',
      staticPaths: [
        ['static-echo', 'static-echo-2'],
        ['hello', 'hello-2'],
      ] as const,
      component,
    });
    const staticWildcardPage = createPage({
      render: 'static',
      path: '/static/wild/[...wild]',
      staticPaths: [
        ['bar'],
        ['hello', 'hello-2'],
        ['foo', 'foo-2', 'foo-3'],
      ] as const,
      component,
    });

    return [
      dynamicNoSlug,
      dynamicOneSlugPage,
      dynamicTwoSlugPage,
      dynamicWildcardPage,
      dynamicSlugAndWildcardPage,

      staticNoSlug,
      staticOneSlugPage,
      staticTwoSlugPage,
      staticWildcardPage,
    ];
  });
};

describe('type tests', () => {
  it('PathWithoutSlug', () => {
    expectType<PathWithoutSlug<'/test'>>('/test');
    expectType<PathWithoutSlug<'/test/a'>>('/test/a');
    // @ts-expect-error: PathWithoutSlug does not allow slugs - surprise!
    expectType<PathWithoutSlug<'/test/[slug]'>>('/test/[slug]');
    // @ts-expect-error: PathWithoutSlug does not allow prefixed slugs either
    expectType<PathWithoutSlug<'/@[username]'>>('/@[username]');
  });
  it('PathWithSlug', () => {
    expectType<PathWithSlug<'/test/[slug]', 'slug'>>('/test/[slug]');
    expectType<PathWithSlug<'/test/[a]/[b]', 'a'>>('/test/[a]/[b]');
    expectType<PathWithSlug<'/test/[a]/[b]', 'b'>>('/test/[a]/[b]');
    // @ts-expect-error: PathWithSlug fails if the path does not match.
    expectType<PathWithSlug<'/test/[a]', 'a'>>('/test/[a]/[b]');
    // @ts-expect-error: PathWithSlug fails if the slug-id is not in the path.
    expectType<PathWithSlug<'/test/[a]/[b]', 'c'>>('/test/[a]/[b]');
    // Prefixed slugs
    expectType<PathWithSlug<'/@[username]', 'username'>>('/@[username]');
    expectType<PathWithSlug<'/u-[id]', 'id'>>('/u-[id]');
    expectType<PathWithSlug<'/users/@[username]/posts', 'username'>>(
      '/users/@[username]/posts',
    );
  });
  it('PathWithWildcard', () => {
    expectType<PathWithWildcard<'/test/[...path]', never, 'path'>>(
      '/test/[...path]',
    );
    expectType<PathWithWildcard<'/test/[slug]/[...path]', 'slug', 'path'>>(
      '/test/[slug]/[...path]',
    );
    expectType<PathWithWildcard<'/test/[slug]/[...path]', 'slug', 'path'>>(
      // @ts-expect-error: PathWithWildcard fails if the path does not match.
      '/test/[a]/[...path]',
    );
  });
  it('HasSlugInPath', () => {
    expectType<HasSlugInPath<'/test/[a]/[b]', 'a'>>(true);
    expectType<HasSlugInPath<'/test/[a]/[b]', 'b'>>(true);
    expectType<HasSlugInPath<'/test/[a]/[b]', 'c'>>(false);
    expectType<HasSlugInPath<'/test/[a]/[b]', 'd'>>(false);
    // Prefixed slugs
    expectType<HasSlugInPath<'/@[username]', 'username'>>(true);
    expectType<HasSlugInPath<'/@[username]', 'other'>>(false);
    expectType<HasSlugInPath<'/u-[id]', 'id'>>(true);
    expectType<HasSlugInPath<'/test/pre-[id]-suf', 'id'>>(true);
    expectType<HasSlugInPath<'/users/@[username]/posts', 'username'>>(true);
  });
  it('IsValidPathInSlugPath', () => {
    expectType<IsValidPathInSlugPath<'/test/[a]/[b]'>>(true);
    expectType<IsValidPathInSlugPath<'/test/[a]/[b]'>>(true);
    expectType<IsValidPathInSlugPath<'/test'>>(true);

    expectType<IsValidPathInSlugPath<'foobar'>>(false);
    expectType<IsValidPathInSlugPath<'/'>>(false);
  });
  it('HasWildcardInPath', () => {
    expectType<HasWildcardInPath<'/test/[...path]'>>(true);
    expectType<HasWildcardInPath<'/test/[a]/[...path]'>>(true);
    expectType<HasWildcardInPath<'/test/[a]/[b]/[...path]'>>(true);

    expectType<HasWildcardInPath<'/test/[a]/[b]'>>(false);
    expectType<HasWildcardInPath<'/test'>>(false);
    expectType<HasWildcardInPath<'/'>>(false);
  });
  it('GetSlugs', () => {
    expectType<GetSlugs<'/test/[a]/[b]'>>(['a', 'b']);
    expectType<GetSlugs<'/test/[a]/[b]'>>(['a', 'b']);
    expectType<GetSlugs<'/test/[a]/[b]/[c]'>>(['a', 'b', 'c']);
    expectType<GetSlugs<'/test/[a]/[b]/[c]/[d]'>>(['a', 'b', 'c', 'd']);
    // Prefixed slugs
    expectType<GetSlugs<'/@[username]'>>(['username']);
    expectType<GetSlugs<'/u-[id]'>>(['id']);
    expectType<GetSlugs<'/pre-[id]-suf'>>(['id']);
    expectType<GetSlugs<'/users/@[username]/posts'>>(['username']);
  });
  it('StaticSlugRoutePathsTuple', () => {
    expectType<StaticSlugRoutePathsTuple<'/test/[a]/[b]'>>(['a', 'b']);
    expectType<StaticSlugRoutePathsTuple<'/test/[a]/[b]/[c]'>>([
      'foo',
      'bar',
      'buzz',
    ]);
    // @ts-expect-error: Too many slugs
    expectType<StaticSlugRoutePathsTuple<'/test/[a]/[b]/[c]'>>([
      'foo',
      'bar',
      'buzz',
      'baz',
    ]);
  });

  describe('createPage', () => {
    it('static', () => {
      const createPage: CreatePage = vi.fn();
      // @ts-expect-error: render is not valid
      createPage({ render: 'foo' });
      // @ts-expect-error: path is required
      createPage({ render: 'static' });
      // @ts-expect-error: path is invalid
      createPage({ render: 'static', path: 'bar' });
      // @ts-expect-error: component is missing
      createPage({ render: 'static', path: '/' });
      // @ts-expect-error: component is not a function
      createPage({ render: 'static', path: '/', component: 123 });
      // @ts-expect-error: missing static paths
      createPage({ render: 'static', path: '/[a]', component: () => 'Hello' });

      createPage({
        render: 'static',
        path: '/test/[a]/[b]',
        // @ts-expect-error: static paths do not match the slug pattern
        staticPaths: ['c'],
        component: () => 'Hello',
      });

      // good
      createPage({
        render: 'static',
        path: '/test/[a]',
        staticPaths: ['x', 'y', 'z'],
        component: () => 'Hello',
      });
      createPage({
        render: 'static',
        path: '/test/[a]/[b]',
        staticPaths: [
          ['a', 'b'],
          ['c', 'd'],
        ],
        component: () => 'Hello',
      });
      createPage({
        render: 'static',
        path: '/test/[...wild]',
        staticPaths: ['c', 'd', 'e'],
        component: () => 'Hello',
      });
    });
    it('dynamic', () => {
      const createPage: CreatePage = vi.fn();
      // @ts-expect-error: render is not valid
      createPage({ render: 'foo' });
      // @ts-expect-error: path is required
      createPage({ render: 'dynamic' });
      // @ts-expect-error: path is invalid
      createPage({ render: 'dynamic', path: 'bar' });
      // @ts-expect-error: component is missing
      createPage({ render: 'dynamic', path: '/' });
      // @ts-expect-error: component is not a function
      createPage({ render: 'dynamic', path: '/', component: 123 });

      // good
      createPage({ render: 'dynamic', path: '/[a]', component: () => 'Hello' });
      // good - prefixed slugs
      createPage({
        render: 'dynamic',
        path: '/@[username]',
        component: () => 'Hello',
      });
      createPage({
        render: 'dynamic',
        path: '/u-[id]',
        component: () => 'Hello',
      });
    });
  });
  describe('createLayout', () => {
    it('static', () => {
      const createLayout: CreateLayout = vi.fn();
      // @ts-expect-error: render is not valid
      createLayout({ render: 'foo' });
      // @ts-expect-error: path is invalid
      createLayout({ render: 'static', path: 'bar' });
      // @ts-expect-error: component is missing
      createLayout({ render: 'static' });
      // @ts-expect-error: component is not a function
      createLayout({ render: 'static', component: 123 });

      // good
      createLayout({ render: 'static', path: '/', component: () => 'Hello' });
    });
    it('dynamic', () => {
      const createLayout: CreateLayout = vi.fn();
      // @ts-expect-error: path is invalid
      createLayout({ render: 'dynamic', path: 'bar' });
      // @ts-expect-error: component is missing
      createLayout({ render: 'dynamic' });
      // @ts-expect-error: component is not a function
      createLayout({ render: 'static', component: 123 });

      // good
      createLayout({ render: 'dynamic', path: '/', component: () => 'Hello' });
    });
  });
  describe('createSlice', () => {
    it('static', () => {
      const createSlice: CreateSlice = vi.fn();
      // @ts-expect-error: render is not valid
      createSlice({ render: 'foo' });
      // @ts-expect-error: path is invalid
      createSlice({ render: 'static', path: 'bar' });
      // @ts-expect-error: component is missing
      createSlice({ render: 'static' });
      // @ts-expect-error: component is not a function
      createSlice({ render: 'static', component: 123 });
      // @ts-expect-error: id is missing
      createSlice({ render: 'static', paths: ['/'] });
      // @ts-expect-error: id is not a string
      createSlice({ render: 'static', paths: ['/'], id: 123 });
      // good
      createSlice({ render: 'static', component: () => null, id: 'slice001' });
    });
    it('static with slug', () => {
      const createSlice: CreateSlice = vi.fn();
      // @ts-expect-error: staticPaths is required for static slug slice
      createSlice({
        render: 'static',
        component: () => null,
        id: 'dynamic/[id]',
      });
      // good
      createSlice({
        render: 'static',
        component: () => null,
        id: 'dynamic/[id]',
        staticPaths: ['foo', 'bar'],
      });
    });
    it('dynamic', () => {
      const createSlice: CreateSlice = vi.fn();
      // @ts-expect-error: path is invalid
      createSlice({ render: 'dynamic', path: 'bar' });
      // @ts-expect-error: component is missing
      createSlice({ render: 'dynamic' });
      // @ts-expect-error: component is not a function
      createSlice({ render: 'static', component: 123 });
      // @ts-expect-error: id is missing
      createSlice({ render: 'static', paths: ['/'] });
      // @ts-expect-error: id is not a string
      createSlice({ render: 'static', paths: ['/'], id: 123 });
      // good
      createSlice({ render: 'static', component: () => null, id: 'slice001' });
    });
  });

  describe('createApi', () => {
    it('static', () => {
      const createApi: CreateApi = vi.fn();
      createApi({
        path: '/',
        // @ts-expect-error: render is not valid
        render: 'foo',
        method: 'GET',
        // @ts-expect-error: null is not valid Response
        handler: () => null,
      });
      createApi({
        path: '/',
        render: 'static',
        // @ts-expect-error: method is not valid
        method: 'foo',
        handler: async () => Response.json('test'),
      });
      createApi({
        path: '/',
        render: 'static',
        method: 'GET',
        // @ts-expect-error: null is not valid
        handler: () => null,
      });
      // @ts-expect-error: handler is not valid
      createApi({ path: '/', render: 'static', method: 'GET', handler: 123 });

      // good
      createApi({
        path: '/',
        render: 'static',
        method: 'GET',
        handler: async () => {
          return new Response('Hello World');
        },
      });
    });
    it('dynamic', () => {
      const createApi: CreateApi = vi.fn();
      createApi({
        path: '/',
        // @ts-expect-error: render not valid
        render: 'foo',
        method: 'GET',
        // @ts-expect-error: handler not valid
        handler: () => null,
      });
      createApi({
        path: '/foo',
        render: 'dynamic',
        handlers: {
          // @ts-expect-error: null is not valid
          GET: () => null,
        },
      });
      // @ts-expect-error: handler is not valid
      createApi({ path: '/', render: 'dynamic', method: 'GET', handler: 123 });

      // good
      createApi({
        path: '/foo/[slug]',
        render: 'dynamic',
        handlers: {
          POST: async (req) => {
            return new Response('Hello World ' + new URL(req.url).pathname);
          },
        },
      });
    });
  });

  describe('createPages', () => {
    it('empty', () => {
      const mockedCreatePages: typeof createPages = vi.fn();

      // @ts-expect-error: null is not a valid return type
      mockedCreatePages(async () => null);

      // @ts-expect-error: page result is not returned
      const _emptyRouterDynamic = mockedCreatePages(async ({ createPage }) => {
        createPage({ render: 'dynamic', path: '/', component: () => 'Hello' });
      });

      // @ts-expect-error: page result is not returned
      const _emptyRouterStatic = mockedCreatePages(async ({ createPage }) => {
        createPage({ render: 'static', path: '/', component: () => 'Hello' });
      });

      // good and empty
      const _emptyRouter = mockedCreatePages(async () => []);
      expectType<TypeEqual<PathsForPages<typeof _emptyRouter>, string>>(true);
    });

    it('static', () => {
      const mockedCreatePages: typeof createPages = vi.fn();

      // good and single page
      const _singlePageRouter = mockedCreatePages(async ({ createPage }) => [
        createPage({ render: 'static', path: '/', component: () => 'Hello' }),
      ]);
      expectType<TypeEqual<PathsForPages<typeof _singlePageRouter>, '/'>>(true);

      // good with multiple pages
      const _multiplePageRouter = mockedCreatePages(async ({ createPage }) => [
        createPage({ render: 'static', path: '/', component: () => 'Hello' }),
        createPage({ render: 'static', path: '/foo', component: () => 'Foo' }),
        createPage({
          render: 'static',
          path: '/bar/[slug]',
          staticPaths: ['a', 'b'] as const,
          component: () => 'Bar',
        }),
        createPage({
          render: 'static',
          path: '/buzz/[...slug]',
          staticPaths: [['a'], ['b', 'c'], ['hello', 'world']] as const,
          component: () => 'Bar',
        }),
      ]);
      expectType<
        TypeEqual<
          PathsForPages<typeof _multiplePageRouter>,
          | '/'
          | '/foo'
          | '/bar/a'
          | '/bar/b'
          | '/buzz/a'
          | '/buzz/b/c'
          | '/buzz/hello/world'
        >
      >(true);
    });

    it('dynamic', () => {
      const mockedCreatePages: typeof createPages = vi.fn();

      // good and single page
      const _singlePageRouter = mockedCreatePages(async ({ createPage }) => [
        createPage({ render: 'dynamic', path: '/', component: () => 'Hello' }),
      ]);
      expectType<TypeEqual<PathsForPages<typeof _singlePageRouter>, '/'>>(true);

      // good with multiple pages
      const _multiplePageRouter = mockedCreatePages(async ({ createPage }) => [
        createPage({ render: 'dynamic', path: '/', component: () => 'Hello' }),
        createPage({ render: 'dynamic', path: '/foo', component: () => 'Foo' }),
        createPage({
          render: 'dynamic',
          path: '/bar/[slug]',
          component: () => 'Bar',
        }),
        createPage({
          render: 'dynamic',
          path: '/buzz/thing/[...slug]',
          component: () => 'Bar',
        }),
      ]);
      expectType<
        TypeEqual<
          PathsForPages<typeof _multiplePageRouter>,
          '/' | '/foo' | `/bar/${string}` | `/buzz/thing/${string}`
        >
      >(true);
    });

    it('dynamic with prefixed slugs', () => {
      const mockedCreatePages: typeof createPages = vi.fn();

      const _prefixedRouter = mockedCreatePages(async ({ createPage }) => [
        createPage({
          render: 'dynamic',
          path: '/@[username]',
          component: () => 'Profile',
        }),
        createPage({
          render: 'dynamic',
          path: '/u-[id]',
          component: () => 'User',
        }),
      ]);
      expectType<
        TypeEqual<
          PathsForPages<typeof _prefixedRouter>,
          `/@${string}` | `/u-${string}`
        >
      >(true);
    });

    it('static with prefixed slugs', () => {
      const mockedCreatePages: typeof createPages = vi.fn();

      const _prefixedStaticRouter = mockedCreatePages(
        async ({ createPage }) => [
          createPage({
            render: 'static',
            path: '/@[username]',
            staticPaths: ['joe', 'alice'] as const,
            component: () => 'Profile',
          }),
        ],
      );
      expectType<
        TypeEqual<
          PathsForPages<typeof _prefixedStaticRouter>,
          '/@joe' | '/@alice'
        >
      >(true);
    });

    it('static + dynamic mixed', () => {
      const mockedCreatePages: typeof createPages = vi.fn();

      // good and simple
      const _simpleRouter = mockedCreatePages(async ({ createPage }) => [
        createPage({ render: 'dynamic', path: '/', component: () => 'Hello' }),
        createPage({
          render: 'static',
          path: '/about',
          component: () => 'about me',
        }),
      ]);
      expectType<
        TypeEqual<PathsForPages<typeof _simpleRouter>, '/' | '/about'>
      >(true);

      // good and complex
      const _complexRouter = complexTestRouter(mockedCreatePages);
      expectType<
        TypeEqual<
          PathsForPages<typeof _complexRouter>,
          | '/client/dynamic'
          | '/client/static'
          | `/server/one/${string}`
          | `/server/two/${string}/${string}`
          | `/server/wild/${string}`
          | `/server/oneAndWild/${string}/${string}`
          | '/server/static/static-echo'
          | '/server/static/static-echo-2'
          | '/server/static/static-echo/static-echo-2'
          | '/server/static/hello/hello-2'
          | '/static/wild/hello/hello-2'
          | '/static/wild/bar'
          | '/static/wild/foo/foo-2/foo-3'
        >
      >(true);
    });
  });
});

const defineRouterMock = unstable_defineRouter as MockedFunction<
  typeof unstable_defineRouter
>;

vi.mock('../src/router/define-router.js', () => ({
  unstable_defineRouter: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

function injectedFunctions() {
  expect(defineRouterMock).toHaveBeenCalledTimes(1);
  assert(defineRouterMock.mock.calls[0]?.[0].getConfigs);
  return {
    getConfigs: defineRouterMock.mock.calls[0][0].getConfigs,
  };
}

describe('createPages pages and layouts', () => {
  it('creates a simple static page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test',
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();

    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('creates a simple dynamic page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test',
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test': { isStatic: false, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: false,
        slices: [],
      },
    ]);
  });

  it('creates a simple static api', async () => {
    createPages(async ({ createApi }) => [
      createApi({
        path: '/test',
        render: 'static',
        method: 'GET',
        handler: async () => {
          return new Response('Hello World');
        },
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'api',
        path: [{ type: 'literal', name: 'test' }],
        isStatic: true,
        handler: expect.any(Function),
      },
    ]);
    const [{ handler }] = Array.from(await getConfigs()) as any;
    const res = await handler(
      new Request(new URL('http://localhost:3000/test')),
    );
    expect(res.headers.get('content-type')).toEqual('text/plain;charset=UTF-8');
    const text = await res.text();
    expect(text).toEqual('Hello World');
    expect(res.status).toEqual(200);
  });

  it('creates a simple dynamic api', async () => {
    createPages(async ({ createApi }) => [
      createApi({
        path: '/test/[slug]',
        render: 'dynamic',
        handlers: {
          GET: async () => {
            return new Response('Hello World');
          },
        },
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'api',
        path: [
          { type: 'literal', name: 'test' },
          { type: 'group', name: 'slug' },
        ],
        isStatic: false,
        handler: expect.any(Function),
      },
    ]);
    const [{ handler }] = Array.from(await getConfigs()) as any;
    const res = await handler(
      new Request(new URL('http://localhost:3000/test/foo')),
    );
    expect(res.headers.get('content-type')).toEqual('text/plain;charset=UTF-8');
    const text = await res.text();
    expect(text).toEqual('Hello World');
    expect(res.status).toEqual(200);
  });

  it('creates a simple static page with a layout', async () => {
    const TestPage = () => null;
    const TestLayout = ({ children }: PropsWithChildren) => children;
    createPages(async ({ createPage, createLayout }) => [
      createLayout({
        render: 'static',
        path: '/',
        component: TestLayout,
      }),
      createPage({
        render: 'static',
        path: '/test',
        component: TestPage,
      }),
    ]);

    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'layout:/': { isStatic: true, renderer: expect.any(Function) },
          'page:/test': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('creates a simple dynamic page with a layout', async () => {
    const TestPage = () => null;
    const TestLayout = ({ children }: PropsWithChildren) => children;
    createPages(async ({ createPage, createLayout }) => [
      createLayout({
        render: 'dynamic',
        path: '/',
        component: TestLayout,
      }),
      createPage({
        render: 'dynamic',
        path: '/test',
        component: TestPage,
      }),
    ]);

    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'layout:/': { isStatic: false, renderer: expect.any(Function) },
          'page:/test': { isStatic: false, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: false,
        slices: [],
      },
    ]);
  });

  it('creates a simple static slice', async () => {
    const TestPage = () => null;
    const TestSlice = () => null;
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'static',
        path: '/',
        component: TestPage,
        slices: ['slice001'],
      }),
      createSlice({
        render: 'static',
        component: TestSlice,
        id: 'slice001',
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [],
        isStatic: true,
        slices: ['slice001'],
      },
      {
        type: 'slice',
        id: 'slice001',
        isStatic: true,
        renderer: expect.any(Function),
      },
    ]);
  });

  it('creates a simple dynamic page with slices', async () => {
    const TestPage = () => null;
    const TestSlice = () => null;
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/',
        component: TestPage,
        slices: ['slice001'],
      }),
      createSlice({
        render: 'static',
        component: TestSlice,
        id: 'slice001',
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/': { isStatic: false, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [],
        isStatic: false,
        slices: ['slice001'],
      },
      {
        type: 'slice',
        id: 'slice001',
        isStatic: true,
        renderer: expect.any(Function),
      },
    ]);
  });

  it('attaches slices to a static page declared under a pathless group', async () => {
    const TestPage = () => null;
    const TestSlice = () => null;
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'static',
        path: '/(group)/foo',
        component: TestPage,
        slices: ['slice001'],
      }),
      createSlice({
        render: 'static',
        component: TestSlice,
        id: 'slice001',
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = (await getConfigs()) as {
      type: string;
      slices?: string[];
    }[];
    const route = configs.find((c) => c.type === 'route');
    expect(route?.slices).toEqual(['slice001']);
  });

  it('attaches slices to a dynamic page declared under a pathless group', async () => {
    const TestPage = () => null;
    const TestSlice = () => null;
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/(group)/[lang]',
        component: TestPage,
        slices: ['slice001'],
      }),
      createSlice({
        render: 'static',
        component: TestSlice,
        id: 'slice001',
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = (await getConfigs()) as {
      type: string;
      slices?: string[];
    }[];
    const route = configs.find((c) => c.type === 'route');
    expect(route?.slices).toEqual(['slice001']);
  });

  it('attaches slices to every concrete instance of a static slug page declared under a pathless group', async () => {
    const TestPage = () => null;
    const TestSlice = () => null;
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'static',
        path: '/(group)/[lang]/about',
        staticPaths: ['en', 'fr'] as const,
        component: TestPage,
        slices: ['slice001'],
      }),
      createSlice({
        render: 'static',
        component: TestSlice,
        id: 'slice001',
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = (await getConfigs()) as {
      type: string;
      path?: { name?: string; type: string }[];
      slices?: string[];
    }[];
    const routes = configs.filter((c) => c.type === 'route');
    expect(routes).toHaveLength(2);
    for (const route of routes) {
      expect(route.slices).toEqual(['slice001']);
    }
  });

  it('creates a wildcard page with slices', async () => {
    const TestPage = () => null;
    const TestSlice = () => null;
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test/[...wildcard]',
        component: TestPage,
        slices: ['slice001'],
      }),
      createSlice({
        render: 'static',
        component: TestSlice,
        id: 'slice001',
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/[...wildcard]': {
            isStatic: false,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'wildcard', type: 'wildcard' },
        ],
        isStatic: false,
        slices: ['slice001'],
      },
      {
        type: 'slice',
        id: 'slice001',
        isStatic: true,
        renderer: expect.any(Function),
      },
    ]);
  });

  it('creates a slice with slug pattern', async () => {
    const TestPage = () => null;
    const TestSlice = (_props: { id: string }) => null;
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/',
        component: TestPage,
      }),
      createSlice({
        render: 'dynamic',
        component: TestSlice,
        id: 'tooltip/[id]',
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = Array.from(await getConfigs());
    const sliceConfig = configs.find(
      (c: any) => c.type === 'slice' && c.id === 'tooltip/[id]',
    );
    expect(sliceConfig).toEqual({
      type: 'slice',
      id: 'tooltip/[id]',
      pathSpec: [
        { type: 'literal', name: 'tooltip' },
        { type: 'group', name: 'id' },
      ],
      isStatic: false,
      renderer: expect.any(Function),
    });
  });

  it('creates a slice with nested slug pattern', async () => {
    const TestPage = () => null;
    const TestSlice = (_props: { category: string; id: string }) => null;
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/',
        component: TestPage,
      }),
      createSlice({
        render: 'dynamic',
        component: TestSlice,
        id: 'items/[category]/[id]',
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = Array.from(await getConfigs());
    const sliceConfig = configs.find(
      (c: any) => c.type === 'slice' && c.id === 'items/[category]/[id]',
    );
    expect(sliceConfig).toEqual({
      type: 'slice',
      id: 'items/[category]/[id]',
      pathSpec: [
        { type: 'literal', name: 'items' },
        { type: 'group', name: 'category' },
        { type: 'group', name: 'id' },
      ],
      isStatic: false,
      renderer: expect.any(Function),
    });
  });

  it('slug slice renderer passes params and children placeholder as props', async () => {
    const TestPage = () => null;
    const TestSlice = (_props: { id: string }) => null;
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/',
        component: TestPage,
      }),
      createSlice({
        render: 'dynamic',
        component: TestSlice,
        id: 'tooltip/[id]',
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = Array.from(await getConfigs());
    const sliceConfig = configs.find(
      (c: any) => c.type === 'slice' && c.id === 'tooltip/[id]',
    ) as any;
    const element = await sliceConfig.renderer({ id: '123' });
    expect(element).toBeDefined();
    expect(element.props.id).toBe('123');
    expect(element.props.children.type).toBe(Children);
  });

  it('static slice without slug has no pathSpec', async () => {
    const TestPage = () => null;
    const TestSlice = () => null;
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/',
        component: TestPage,
      }),
      createSlice({
        render: 'static',
        component: TestSlice,
        id: 'simple',
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = Array.from(await getConfigs());
    const sliceConfig = configs.find(
      (c: any) => c.type === 'slice' && c.id === 'simple',
    );
    expect(sliceConfig).toEqual({
      type: 'slice',
      id: 'simple',
      isStatic: true,
      renderer: expect.any(Function),
    });
    expect(sliceConfig).not.toHaveProperty('pathSpec');
  });

  it('static slug slice expands staticPaths into concrete entries', async () => {
    const TestPage = () => null;
    const TestSlice = (_props: { id: string }) => null;
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/',
        component: TestPage,
      }),
      createSlice({
        render: 'static',
        component: TestSlice,
        id: 'dynamic/[id]',
        staticPaths: ['foo', 'bar'],
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = Array.from(await getConfigs());
    const sliceConfigs = configs.filter((c: any) => c.type === 'slice');
    expect(sliceConfigs).toHaveLength(2);
    expect(sliceConfigs).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: 'slice',
          id: 'dynamic/foo',
          isStatic: true,
        }),
        expect.objectContaining({
          type: 'slice',
          id: 'dynamic/bar',
          isStatic: true,
        }),
      ]),
    );
    // Concrete entries are literal — no pathSpec.
    sliceConfigs.forEach((c: any) => expect(c).not.toHaveProperty('pathSpec'));
    // Renderer binds the slug param: invoking the wrapper passes the
    // mapped slug value through to the user's component as a prop.
    const fooConfig = sliceConfigs.find((c: any) => c.id === 'dynamic/foo');
    const wrapper = await (fooConfig as any).renderer();
    const inner = (wrapper as any).type((wrapper as any).props);
    expect(inner.props.id).toBe('foo');
  });

  it('static slug slice fails when staticPaths is missing', async () => {
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/',
        component: () => null,
      }),
      // @ts-expect-error: staticPaths is required for slug slices
      createSlice({
        render: 'static',
        component: () => null,
        id: 'dynamic/[id]',
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    await expect(getConfigs).rejects.toThrowError(
      /Static slice with slug requires staticPaths/,
    );
  });

  it('static slug slice fails when staticPaths length does not match slugs', async () => {
    createPages(async ({ createSlice, createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/',
        component: () => null,
      }),
      createSlice({
        render: 'static',
        component: () => null,
        id: 'items/[category]/[id]',
        // @ts-expect-error: each entry must be [string, string] for two slugs
        staticPaths: ['only-one'],
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    await expect(getConfigs).rejects.toThrowError(
      'staticPaths does not match with slug pattern',
    );
  });

  it('fails when two slices share the same id', async () => {
    createPages(async ({ createSlice }) => [
      createSlice({
        render: 'static',
        id: 'dup',
        component: () => null,
      }),
      createSlice({
        render: 'dynamic',
        id: 'dup',
        component: () => null,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    await expect(getConfigs).rejects.toThrowError('Duplicated slice id: dup');
  });

  it('fails when a static slug slice expansion produces a duplicate concrete id', async () => {
    createPages(async ({ createSlice }) => [
      createSlice({
        render: 'static',
        id: 'items/[id]',
        component: () => null,
        staticPaths: ['a', 'a'],
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    await expect(getConfigs).rejects.toThrowError(
      'Duplicated slice id: items/a',
    );
  });

  it('creates a nested static page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/nested',
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/nested': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'nested', type: 'literal' },
        ],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('creates a nested static page with nested layout', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage, createLayout }) => [
      createPage({
        render: 'static',
        path: '/test/nested',
        component: TestPage,
      }),
      createLayout({
        render: 'static',
        path: '/test/nested',
        component: () => null,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/nested': {
            isStatic: true,
            renderer: expect.any(Function),
          },
          'layout:/test/nested': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'nested', type: 'literal' },
        ],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('creates a nested dynamic page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test/nested',
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/nested': {
            isStatic: false,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'nested', type: 'literal' },
        ],
        isStatic: false,
        slices: [],
      },
    ]);
  });

  it('creates a static page with slugs', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/[a]/[b]',
        staticPaths: [
          ['w', 'x'],
          ['y', 'z'],
        ],
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/w/x': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'w', type: 'literal' },
          { name: 'x', type: 'literal' },
        ],
        pathPattern: [
          { name: 'test', type: 'literal' },
          { name: 'a', type: 'group' },
          { name: 'b', type: 'group' },
        ],
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        elements: {
          'page:/test/y/z': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'y', type: 'literal' },
          { name: 'z', type: 'literal' },
        ],
        pathPattern: [
          { name: 'test', type: 'literal' },
          { name: 'a', type: 'group' },
          { name: 'b', type: 'group' },
        ],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('creates a dynamic page with slugs', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test/[a]/[b]',
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/[a]/[b]': {
            isStatic: false,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'a', type: 'group' },
          { name: 'b', type: 'group' },
        ],
        isStatic: false,
        slices: [],
      },
    ]);
  });

  it('creates a static page with wildcards', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/[...path]',
        staticPaths: [['a', 'b']],
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/a/b': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'a', type: 'literal' },
          { name: 'b', type: 'literal' },
        ],
        pathPattern: [
          { name: 'test', type: 'literal' },
          { name: 'path', type: 'wildcard' },
        ],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('creates a dynamic page with wildcards', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test/[...path]',
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/[...path]': {
            isStatic: false,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'path', type: 'wildcard' },
        ],
        isStatic: false,
        slices: [],
      },
    ]);
  });

  it('creates a dynamic catch-all route that handles index', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/[...catchAll]',
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/[...catchAll]': {
            isStatic: false,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [{ name: 'catchAll', type: 'wildcard' }],
        isStatic: false,
        slices: [],
      },
    ]);
  });

  it('root route comes before wildcard route in priority ordering', async () => {
    const IndexPage = vi.fn();
    const NotFoundPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/[...notFound]',
        component: NotFoundPage,
      }),
      createPage({
        render: 'dynamic',
        path: '/',
        component: IndexPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = await getConfigs();
    // Verify both routes exist
    expect(configs).toHaveLength(2);
    // Verify root route comes first (before wildcard route)
    const rootRoute = Array.from(configs).find(
      (config) => config.type === 'route' && config.path.length === 0,
    );
    const wildcardRoute = Array.from(configs).find(
      (config) =>
        config.type === 'route' &&
        config.path.length === 1 &&
        config.path[0]?.type === 'wildcard',
    );
    expect(rootRoute).toBeDefined();
    expect(wildcardRoute).toBeDefined();
    expect(Array.from(configs).indexOf(rootRoute!)).toBeLessThan(
      Array.from(configs).indexOf(wildcardRoute!),
    );
  });

  it('literal route takes priority over dynamic slug route at same depth', async () => {
    const AboutPage = vi.fn();
    const SlugPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/[slug]',
        component: SlugPage,
      }),
      createPage({
        render: 'dynamic',
        path: '/about',
        component: AboutPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = await getConfigs();
    expect(configs).toHaveLength(2);
    const literalRoute = Array.from(configs).find(
      (config) =>
        config.type === 'route' &&
        config.path.length === 1 &&
        config.path[0]?.type === 'literal',
    );
    const slugRoute = Array.from(configs).find(
      (config) =>
        config.type === 'route' &&
        config.path.length === 1 &&
        config.path[0]?.type === 'group',
    );
    expect(literalRoute).toBeDefined();
    expect(slugRoute).toBeDefined();
    expect(Array.from(configs).indexOf(literalRoute!)).toBeLessThan(
      Array.from(configs).indexOf(slugRoute!),
    );
  });

  it('fails if static paths do not match the slug pattern', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/[a]/[b]',
        // @ts-expect-error: staticPaths should be an array of strings or [string, string][]
        staticPaths: [['w']] as const,
        component: () => null,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    await expect(getConfigs).rejects.toThrowError(
      'staticPaths does not match with slug pattern',
    );
  });

  it('creates a static page with slugs containing dots (version numbers)', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/docs/[version]',
        staticPaths: ['v1.0.0', 'v1.1.0', 'v2.0.0'] as const,
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/docs/v1.0.0': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'docs', type: 'literal' },
          { name: 'v1.0.0', type: 'literal' },
        ],
        pathPattern: [
          { name: 'docs', type: 'literal' },
          { name: 'version', type: 'group' },
        ],
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        elements: {
          'page:/docs/v1.1.0': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'docs', type: 'literal' },
          { name: 'v1.1.0', type: 'literal' },
        ],
        pathPattern: [
          { name: 'docs', type: 'literal' },
          { name: 'version', type: 'group' },
        ],
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        elements: {
          'page:/docs/v2.0.0': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'docs', type: 'literal' },
          { name: 'v2.0.0', type: 'literal' },
        ],
        pathPattern: [
          { name: 'docs', type: 'literal' },
          { name: 'version', type: 'group' },
        ],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('creates a static page with slugs containing spaces (converts to hyphens)', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/pokemon/[name]',
        staticPaths: ['Mr. Mime', 'Porygon-Z', 'Type: Null'] as const,
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/pokemon/Mr.-Mime': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'pokemon', type: 'literal' },
          { name: 'Mr.-Mime', type: 'literal' },
        ],
        pathPattern: [
          { name: 'pokemon', type: 'literal' },
          { name: 'name', type: 'group' },
        ],
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        elements: {
          'page:/pokemon/Porygon-Z': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'pokemon', type: 'literal' },
          { name: 'Porygon-Z', type: 'literal' },
        ],
        pathPattern: [
          { name: 'pokemon', type: 'literal' },
          { name: 'name', type: 'group' },
        ],
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        elements: {
          'page:/pokemon/Type:-Null': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'pokemon', type: 'literal' },
          { name: 'Type:-Null', type: 'literal' },
        ],
        pathPattern: [
          { name: 'pokemon', type: 'literal' },
          { name: 'name', type: 'group' },
        ],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('allows to disable SSR on static and dynamic pages', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/static',
        component: () => null,
        unstable_disableSSR: true,
      }),
      createPage({
        render: 'dynamic',
        path: '/dynamic',
        component: () => null,
        unstable_disableSSR: true,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/static': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: true,
        path: [{ name: 'static', type: 'literal' }],
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        elements: {
          'page:/dynamic': { isStatic: false, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: true,
        path: [{ name: 'dynamic', type: 'literal' }],
        isStatic: false,
        slices: [],
      },
    ]);
  });

  it('disables SSR on a static page with slugs and staticPaths', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/post/[id]',
        staticPaths: ['a', 'b'],
        component: () => null,
        unstable_disableSSR: true,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = (await getConfigs()) as { type: string; noSsr?: boolean }[];
    const routes = configs.filter((c) => c.type === 'route');
    expect(routes).toHaveLength(2);
    for (const route of routes) {
      expect(route.noSsr).toBe(true);
    }
  });

  it('disables SSR on an exactPath static page with slug-looking segments', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/post/[id]',
        exactPath: true,
        component: () => null,
        unstable_disableSSR: true,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = (await getConfigs()) as { type: string; noSsr?: boolean }[];
    const route = configs.find((c) => c.type === 'route');
    expect(route?.noSsr).toBe(true);
  });

  it('disables SSR on a dynamic wildcard page', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/files/[...path]',
        component: () => null,
        unstable_disableSSR: true,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = (await getConfigs()) as { type: string; noSsr?: boolean }[];
    const route = configs.find((c) => c.type === 'route');
    expect(route?.noSsr).toBe(true);
  });

  it('disables SSR on an exactPath dynamic page with slug-looking segments', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/post/[id]',
        exactPath: true,
        component: () => null,
        unstable_disableSSR: true,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = (await getConfigs()) as { type: string; noSsr?: boolean }[];
    const route = configs.find((c) => c.type === 'route');
    expect(route?.noSsr).toBe(true);
  });

  it('fails if duplicated dynamic paths are registered', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test',
        component: () => null,
      }),
      createPage({
        render: 'dynamic',
        path: '/test',
        component: () => null,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    await expect(getConfigs).rejects.toThrowError('Duplicated path: /test');
  });

  it('fails if duplicated static paths are registered', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test',
        component: () => null,
      }),
      createPage({
        render: 'static',
        path: '/test',
        component: () => null,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    await expect(getConfigs).rejects.toThrowError('Duplicated path: /test');
  });

  it('fails if duplicated static and dynamic paths override each other', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test',
        component: () => null,
      }),
      createPage({
        render: 'static',
        path: '/test',
        component: () => null,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    await expect(getConfigs).rejects.toThrowError('Duplicated path: /test');
  });

  it('fails if canonical and trailing-slash paths override each other', async () => {
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test',
        component: () => null,
      }),
      createPage({
        render: 'dynamic',
        path: '/test/' as never,
        component: () => null,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    await expect(getConfigs).rejects.toThrowError('Duplicated path: /test/');
  });

  it('fails when a page is registered on a path already used by an api', async () => {
    createPages(async ({ createPage, createApi }) => [
      createApi({
        path: '/test',
        render: 'static',
        method: 'GET',
        handler: async () => new Response('ok'),
      }),
      createPage({
        render: 'dynamic',
        path: '/test',
        component: () => null,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    await expect(getConfigs).rejects.toThrowError('Duplicated path: /test');
  });

  it('fails when an api is registered on a path already used by a page', async () => {
    createPages(async ({ createPage, createApi }) => [
      createPage({
        render: 'dynamic',
        path: '/test',
        component: () => null,
      }),
      createApi({
        path: '/test',
        render: 'static',
        method: 'GET',
        handler: async () => new Response('ok'),
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    await expect(getConfigs).rejects.toThrowError('Duplicated api path: /test');
  });

  it('fails when two apis are registered on the same path', async () => {
    createPages(async ({ createApi }) => [
      createApi({
        path: '/test',
        render: 'static',
        method: 'GET',
        handler: async () => new Response('ok'),
      }),
      createApi({
        path: '/test',
        render: 'dynamic',
        handlers: { POST: async () => new Response('ok') },
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    await expect(getConfigs).rejects.toThrowError('Duplicated api path: /test');
  });

  it('creates a complex router', async () => {
    const TestPage = vi.fn();
    complexTestRouter(createPages, TestPage);

    const { getConfigs } = injectedFunctions();

    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'wild',
          },
          {
            type: 'literal',
            name: 'foo',
          },
          {
            type: 'literal',
            name: 'foo-2',
          },
          {
            type: 'literal',
            name: 'foo-3',
          },
        ],
        pathPattern: [
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'wild',
          },
          {
            type: 'wildcard',
            name: 'wild',
          },
        ],
        rootElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        routeElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        elements: {
          'page:/static/wild/foo/foo-2/foo-3': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        noSsr: false,
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'static-echo',
          },
          {
            type: 'literal',
            name: 'static-echo-2',
          },
        ],
        pathPattern: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'group',
            name: 'echo',
          },
          {
            type: 'group',
            name: 'echo2',
          },
        ],
        rootElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        routeElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        elements: {
          'page:/server/static/static-echo/static-echo-2': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        noSsr: false,
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'hello',
          },
          {
            type: 'literal',
            name: 'hello-2',
          },
        ],
        pathPattern: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'group',
            name: 'echo',
          },
          {
            type: 'group',
            name: 'echo2',
          },
        ],
        rootElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        routeElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        elements: {
          'page:/server/static/hello/hello-2': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        noSsr: false,
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'wild',
          },
          {
            type: 'literal',
            name: 'hello',
          },
          {
            type: 'literal',
            name: 'hello-2',
          },
        ],
        pathPattern: [
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'wild',
          },
          {
            type: 'wildcard',
            name: 'wild',
          },
        ],
        rootElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        routeElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        elements: {
          'page:/static/wild/hello/hello-2': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        noSsr: false,
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'two',
          },
          {
            type: 'group',
            name: 'echo',
          },
          {
            type: 'group',
            name: 'echo2',
          },
        ],
        rootElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        routeElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        elements: {
          'page:/server/two/[echo]/[echo2]': {
            isStatic: false,
            renderer: expect.any(Function),
          },
        },
        noSsr: false,
        isStatic: false,
        slices: [],
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'oneAndWild',
          },
          {
            type: 'group',
            name: 'slug',
          },
          {
            type: 'wildcard',
            name: 'wild',
          },
        ],
        rootElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        routeElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        elements: {
          'page:/server/oneAndWild/[slug]/[...wild]': {
            isStatic: false,
            renderer: expect.any(Function),
          },
        },
        noSsr: false,
        isStatic: false,
        slices: [],
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'static-echo',
          },
        ],
        pathPattern: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'group',
            name: 'echo',
          },
        ],
        rootElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        routeElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        elements: {
          'page:/server/static/static-echo': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        noSsr: false,
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'static-echo-2',
          },
        ],
        pathPattern: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'group',
            name: 'echo',
          },
        ],
        rootElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        routeElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        elements: {
          'page:/server/static/static-echo-2': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        noSsr: false,
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'wild',
          },
          {
            type: 'literal',
            name: 'bar',
          },
        ],
        pathPattern: [
          {
            type: 'literal',
            name: 'static',
          },
          {
            type: 'literal',
            name: 'wild',
          },
          {
            type: 'wildcard',
            name: 'wild',
          },
        ],
        rootElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        routeElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        elements: {
          'page:/static/wild/bar': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        noSsr: false,
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'one',
          },
          {
            type: 'group',
            name: 'echo',
          },
        ],
        rootElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        routeElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        elements: {
          'page:/server/one/[echo]': {
            isStatic: false,
            renderer: expect.any(Function),
          },
        },
        noSsr: false,
        isStatic: false,
        slices: [],
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'server',
          },
          {
            type: 'literal',
            name: 'wild',
          },
          {
            type: 'wildcard',
            name: 'wild',
          },
        ],
        rootElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        routeElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        elements: {
          'page:/server/wild/[...wild]': {
            isStatic: false,
            renderer: expect.any(Function),
          },
        },
        noSsr: false,
        isStatic: false,
        slices: [],
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'client',
          },
          {
            type: 'literal',
            name: 'static',
          },
        ],
        rootElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        routeElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        elements: {
          'page:/client/static': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        noSsr: false,
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        path: [
          {
            type: 'literal',
            name: 'client',
          },
          {
            type: 'literal',
            name: 'dynamic',
          },
        ],
        rootElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        routeElement: {
          isStatic: true,
          renderer: expect.any(Function),
        },
        elements: {
          'page:/client/dynamic': {
            isStatic: false,
            renderer: expect.any(Function),
          },
        },
        noSsr: false,
        isStatic: false,
        slices: [],
      },
    ]);
  });

  it('rejects createPage calls after the router has been configured', async () => {
    let savedCreatePage: CreatePage | undefined;
    createPages(async ({ createPage }) => {
      savedCreatePage = createPage;
      return null as never;
    });
    const { getConfigs } = injectedFunctions();
    await getConfigs();
    expect(() =>
      savedCreatePage?.({
        render: 'static',
        path: '/late',
        component: () => null,
      }),
    ).toThrowError('createPage no longer available');
  });

  it('rejects createLayout calls after the router has been configured', async () => {
    let savedCreateLayout: CreateLayout | undefined;
    createPages(async ({ createLayout }) => {
      savedCreateLayout = createLayout;
      return null as never;
    });
    const { getConfigs } = injectedFunctions();
    await getConfigs();
    expect(() =>
      savedCreateLayout?.({
        render: 'static',
        path: '/late',
        component: () => null,
      }),
    ).toThrowError('createLayout no longer available');
  });

  it('rejects createApi calls after the router has been configured', async () => {
    let savedCreateApi: CreateApi | undefined;
    createPages(async ({ createApi }) => {
      savedCreateApi = createApi;
      return null as never;
    });
    const { getConfigs } = injectedFunctions();
    await getConfigs();
    expect(() =>
      savedCreateApi?.({
        path: '/late',
        render: 'static',
        method: 'GET',
        handler: async () => new Response('ok'),
      }),
    ).toThrowError('createApi no longer available');
  });

  it('rejects createSlice calls after the router has been configured', async () => {
    let savedCreateSlice: CreateSlice | undefined;
    createPages(async ({ createSlice }) => {
      savedCreateSlice = createSlice;
      return null as never;
    });
    const { getConfigs } = injectedFunctions();
    await getConfigs();
    expect(() =>
      savedCreateSlice?.({
        render: 'static',
        id: 'late',
        component: () => null,
      }),
    ).toThrowError('createSlice no longer available');
  });

  it('rejects createRoot calls after the router has been configured', async () => {
    let savedCreateRoot: ((root: unknown) => void) | undefined;
    createPages(async ({ createRoot }) => {
      savedCreateRoot = createRoot as never;
      return null as never;
    });
    const { getConfigs } = injectedFunctions();
    await getConfigs();
    expect(() =>
      savedCreateRoot?.({ render: 'static', component: () => null }),
    ).toThrowError('createRoot no longer available');
  });
});

describe('createPages api', () => {
  it('creates a simple static api', async () => {
    createPages(async ({ createApi }) => [
      createApi({
        path: '/test',
        render: 'static',
        method: 'GET',
        handler: async () => {
          return new Response('Hello World');
        },
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'api',
        path: [{ type: 'literal', name: 'test' }],
        isStatic: true,
        handler: expect.any(Function),
      },
    ]);
    const [{ handler }] = Array.from(await getConfigs()) as any;
    const res = await handler(
      new Request(new URL('http://localhost:3000/test')),
    );
    expect(res.headers.get('content-type')).toEqual('text/plain;charset=UTF-8');
    const text = await res.text();
    expect(text).toEqual('Hello World');
    expect(res.status).toEqual(200);
  });

  it('creates a simple dynamic api', async () => {
    createPages(async ({ createApi }) => [
      createApi({
        path: '/test/[slug]',
        render: 'dynamic',
        handlers: {
          GET: async (req) => {
            return new Response('Hello World ' + req.url.split('/').at(-1)!);
          },
        },
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'api',
        path: [
          { type: 'literal', name: 'test' },
          { type: 'group', name: 'slug' },
        ],
        isStatic: false,
        handler: expect.any(Function),
      },
    ]);
    const [{ handler }] = Array.from(await getConfigs()) as any;
    const res = await handler(
      new Request(new URL('http://localhost:3000/test/foo')),
    );
    expect(res.headers.get('content-type')).toEqual('text/plain;charset=UTF-8');
    const text = await res.text();
    expect(text).toEqual('Hello World foo');
    expect(res.status).toEqual(200);
  });

  it('static api with wildcard passes correct params', async () => {
    const receivedParams: unknown[] = [];
    createPages(async ({ createApi }) => [
      createApi({
        path: '/test/[...slugs]',
        render: 'static',
        method: 'GET',
        staticPaths: [['a', 'b'], ['c']],
        handler: async (_req, ctx) => {
          receivedParams.push((ctx as any).params);
          return new Response('ok');
        },
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = Array.from(await getConfigs()) as any[];
    const apiConfigs = configs.filter((c: any) => c.type === 'api');
    expect(apiConfigs).toHaveLength(2);

    // Verify paths are all-literal
    expect(apiConfigs[0]!.path).toEqual([
      { type: 'literal', name: 'test' },
      { type: 'literal', name: 'a' },
      { type: 'literal', name: 'b' },
    ]);
    expect(apiConfigs[1]!.path).toEqual([
      { type: 'literal', name: 'test' },
      { type: 'literal', name: 'c' },
    ]);

    // Call handlers and verify params
    await apiConfigs[0]!.handler(
      new Request('http://localhost:3000/test/a/b'),
      { params: {} },
    );
    await apiConfigs[1]!.handler(new Request('http://localhost:3000/test/c'), {
      params: {},
    });
    expect(receivedParams).toEqual([{ slugs: ['a', 'b'] }, { slugs: ['c'] }]);
  });
});

describe('createPages - exactPath', () => {
  it('creates a simple static page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test',
        exactPath: true,
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('creates a simple dynamic page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/test',
        exactPath: true,
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test': { isStatic: false, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: false,
        slices: [],
      },
    ]);
  });

  it('works with a slug path', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/[slug]',
        exactPath: true,
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/[slug]': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: '[slug]', type: 'literal' },
        ],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('works with a wildcard path', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/[...wildcard]',
        exactPath: true,
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/[...wildcard]': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: '[...wildcard]', type: 'literal' },
        ],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('works with wildcard and slug path', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/[...wildcard]/[slug]',
        exactPath: true,
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/[...wildcard]/[slug]': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: '[...wildcard]', type: 'literal' },
          { name: '[slug]', type: 'literal' },
        ],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('does not work with slug match', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test/[slug]',
        exactPath: true,
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/[slug]': {
            isStatic: true,
            renderer: expect.any(Function),
          },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: '[slug]', type: 'literal' },
        ],
        isStatic: true,
        slices: [],
      },
    ]);
  });
});

describe('createPages - grouped paths', () => {
  it('path with group', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/(group)/test',
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('path with nested group', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/(a)/test/(b)/foo',
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/test/foo': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { name: 'test', type: 'literal' },
          { name: 'foo', type: 'literal' },
        ],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('fails when group path collides with literal', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/(group)/test',
        component: TestPage,
      }),
      createPage({
        render: 'static',
        path: '/test',
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    await expect(getConfigs).rejects.toThrowError('Duplicated path: /test');
  });

  it('supports grouped path with slug', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/(group)/[slug]',
        staticPaths: ['x', 'y'],
        component: TestPage,
      }),
      createPage({
        render: 'static',
        path: '/(group)/z',
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'page:/x': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [{ type: 'literal', name: 'x' }],
        pathPattern: [
          { type: 'literal', name: '(group)' },
          { type: 'group', name: 'slug' },
        ],
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        elements: {
          'page:/y': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        path: [{ type: 'literal', name: 'y' }],
        noSsr: false,
        pathPattern: [
          { type: 'literal', name: '(group)' },
          { type: 'group', name: 'slug' },
        ],
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        elements: {
          'page:/z': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [{ type: 'literal', name: 'z' }],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('supports grouped path with layout', async () => {
    const TestPage = () => null;
    const TestHomePage = () => null;
    const TestLayout = ({ children }: PropsWithChildren) => children;
    const TestRootLayout = ({ children }: PropsWithChildren) => children;
    createPages(async ({ createPage, createLayout }) => [
      createLayout({ render: 'static', path: '/', component: TestRootLayout }),
      createLayout({
        render: 'static',
        path: '/(group)',
        component: TestLayout,
      }),
      createPage({
        render: 'static',
        path: '/(group)/test',
        component: TestPage,
      }),
      createPage({
        render: 'static',
        path: '/(group)',
        component: TestHomePage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'layout:/': { isStatic: true, renderer: expect.any(Function) },
          'layout:/(group)': { isStatic: true, renderer: expect.any(Function) },
          'page:/test': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [{ name: 'test', type: 'literal' }],
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        elements: {
          'page:/': { isStatic: true, renderer: expect.any(Function) },
          'layout:/(group)': { isStatic: true, renderer: expect.any(Function) },
          'layout:/': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('uses concrete layout ids for static layout under grouped dynamic segment', async () => {
    const TestPage = () => null;
    const TestLayout = ({ children }: PropsWithChildren) => children;
    createPages(async ({ createPage, createLayout }) => [
      createLayout({
        render: 'static',
        path: '/(group)/[lang]',
        component: TestLayout,
      }),
      createPage({
        render: 'static',
        path: '/(group)/[lang]/about',
        staticPaths: ['en', 'fr'] as const,
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    expect(await getConfigs()).toEqual([
      {
        type: 'route',
        elements: {
          'layout:/(group)/en': {
            isStatic: true,
            renderer: expect.any(Function),
          },
          'page:/en/about': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { type: 'literal', name: 'en' },
          { type: 'literal', name: 'about' },
        ],
        pathPattern: [
          { type: 'literal', name: '(group)' },
          { type: 'group', name: 'lang' },
          { type: 'literal', name: 'about' },
        ],
        isStatic: true,
        slices: [],
      },
      {
        type: 'route',
        elements: {
          'layout:/(group)/fr': {
            isStatic: true,
            renderer: expect.any(Function),
          },
          'page:/fr/about': { isStatic: true, renderer: expect.any(Function) },
        },
        rootElement: { isStatic: true, renderer: expect.any(Function) },
        routeElement: { isStatic: true, renderer: expect.any(Function) },
        noSsr: false,
        path: [
          { type: 'literal', name: 'fr' },
          { type: 'literal', name: 'about' },
        ],
        pathPattern: [
          { type: 'literal', name: '(group)' },
          { type: 'group', name: 'lang' },
          { type: 'literal', name: 'about' },
        ],
        isStatic: true,
        slices: [],
      },
    ]);
  });

  it('layout renderer passes parent slug props without child slug for dynamic routes', async () => {
    const TestPage = () => null;
    const TestLayout = (_props: { children: ReactNode; lang: string }) => null;
    createPages(async ({ createPage, createLayout }) => [
      createLayout({
        render: 'dynamic',
        path: '/layout-props/[lang]',
        component: TestLayout,
      }),
      createPage({
        render: 'dynamic',
        path: '/layout-props/[lang]/[slug]',
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = Array.from(await getConfigs()) as any[];
    const routeConfig = configs.find(
      (config) =>
        config.type === 'route' &&
        config.path?.[0]?.name === 'layout-props' &&
        config.path?.[1]?.name === 'lang' &&
        config.path?.[2]?.name === 'slug',
    );
    const element = routeConfig.elements[
      'layout:/layout-props/[lang]'
    ].renderer({
      routePath: '/layout-props/en/post-1',
      query: undefined,
    });
    expect(element.props.lang).toBe('en');
    expect(element.props.slug).toBeUndefined();
    expect(element.props.children.type).toBe(Children);
  });

  it('layout renderer passes grouped parent slug props without child slug for static routes', async () => {
    const TestPage = () => null;
    const TestLayout = (_props: {
      children: ReactNode;
      lang: string;
      section: string;
    }) => null;
    createPages(async ({ createPage, createLayout }) => [
      createLayout({
        render: 'static',
        path: '/(group)/layout-props/[lang]/[section]',
        component: TestLayout,
      }),
      createPage({
        render: 'static',
        path: '/(group)/layout-props/[lang]/[section]/[slug]',
        staticPaths: [['en', 'docs', 'post-1']] as const,
        component: TestPage,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = Array.from(await getConfigs()) as any[];
    const routeConfig = configs.find(
      (config) =>
        config.type === 'route' &&
        config.path?.[0]?.name === 'layout-props' &&
        config.path?.[1]?.name === 'en' &&
        config.path?.[2]?.name === 'docs' &&
        config.path?.[3]?.name === 'post-1',
    );
    const element = routeConfig.elements[
      'layout:/(group)/layout-props/en/docs'
    ].renderer({
      routePath: '/layout-props/en/docs/post-1',
      query: undefined,
    });
    expect(element.props.lang).toBe('en');
    expect(element.props.section).toBe('docs');
    expect(element.props.slug).toBeUndefined();
    expect(element.props.children.type).toBe(Children);
  });
});

describe('createPages search codec', () => {
  it('injects parsed props.search and 400s on a malformed query', async () => {
    type S = { page: number };
    const codec = {
      id: 'search-test',
      parse: (query: string): S => {
        const v = new URLSearchParams(query).get('page');
        if (v === 'bad') {
          throw new Error('invalid');
        }
        return { page: Number(v) || 1 };
      },
      serialize: (s: S) => `page=${s.page}`,
    } as const;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'dynamic',
        path: '/search-test',
        component: () => null,
        unstable_searchCodec: codec,
      }),
    ]);
    const { getConfigs } = injectedFunctions();
    const configs = Array.from(await getConfigs()) as any[];
    const routeConfig = configs.find(
      (config) =>
        config.type === 'route' && config.path?.[0]?.name === 'search-test',
    );
    // the codec instance rides the route config; its id feeds the
    // route -> codec id map (__WAKU_ROUTER_SEARCH_CODECS__) that the client uses
    // for the search hooks and push/Link
    expect(routeConfig.searchCodec?.id).toBe('search-test');
    const pageEl = routeConfig.elements['page:/search-test'];
    // parsed search is injected from the query
    expect(
      pageEl.renderer({ routePath: '/search-test', query: 'page=2' }).props
        .search,
    ).toEqual({ page: 2 });
    // default search when there is no query
    expect(
      pageEl.renderer({ routePath: '/search-test', query: undefined }).props
        .search,
    ).toEqual({ page: 1 });
    // a thrown parse becomes a 400
    let thrown: unknown;
    try {
      pageEl.renderer({ routePath: '/search-test', query: 'page=bad' });
    } catch (e) {
      thrown = e;
    }
    expect(getErrorInfo(thrown)?.status).toBe(400);
    // the original parse error is preserved as the cause
    expect((thrown as { cause?: Error }).cause?.message).toBe('invalid');
  });

  it('rejects unstable_searchCodec on a static route', async () => {
    const codec = {
      id: 'static-codec',
      parse: () => ({}),
      serialize: () => '',
    } as const;
    createPages(
      async ({ createPage }) =>
        [
          createPage({
            render: 'static',
            path: '/static-search',
            component: () => null,
            unstable_searchCodec: codec,
          }),
        ] as never,
    );
    const { getConfigs } = injectedFunctions();
    await expect(getConfigs()).rejects.toThrow(/static route/);
  });
});

describe('pathMappingWithoutGroups', () => {
  it('handles paths with pathless groups', () => {
    const pathSpec = parsePathWithSlug('/(foo)/bar');
    expect(pathMappingWithoutGroups(pathSpec, '/bar')).toEqual({});
    expect(pathMappingWithoutGroups(pathSpec, '/(foo)/bar')).toEqual(null);
  });

  it('handles paths with pathless groups and groups', () => {
    const pathSpec = parsePathWithSlug('/(foo)/bar/[id]');
    expect(pathMappingWithoutGroups(pathSpec, '/bar/123')).toEqual({
      id: '123',
    });
    expect(pathMappingWithoutGroups(pathSpec, '/(foo)/bar/123')).toEqual(null);
    expect(pathMappingWithoutGroups(pathSpec, '/(foo)/bar/[id]')).toEqual(null);
  });
});
