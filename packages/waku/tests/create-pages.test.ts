import { expect, vi, describe, it, beforeEach, assert } from 'vitest';
import type { MockedFunction } from 'vitest';
import { createPages } from '../src/router/create-pages.js';
import type {
  CreateLayout,
  CreatePage,
  HasSlugInPath,
  HasWildcardInPath,
  IsValidPathInSlugPath,
  PathWithoutSlug,
  PathWithSlug,
  PathWithWildcard,
  StaticSlugRoutePathsTuple,
} from '../src/router/create-pages.js';
import { unstable_defineRouter } from '../src/router/define-router.js';
import type { PropsWithChildren } from 'react';
import { expectType } from 'ts-expect';
import type { TypeEqual } from 'ts-expect';
import type { PathsForPages } from '../src/router/base-types.js';
import type { GetSlugs } from '../src/router/create-pages-utils/inferred-path-types.js';

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
  });
  it('PathWithSlug', () => {
    expectType<PathWithSlug<'/test/[slug]', 'slug'>>('/test/[slug]');
    expectType<PathWithSlug<'/test/[a]/[b]', 'a'>>('/test/[a]/[b]');
    expectType<PathWithSlug<'/test/[a]/[b]', 'b'>>('/test/[a]/[b]');
    // @ts-expect-error: PathWithSlug fails if the path does not match.
    expectType<PathWithSlug<'/test/[a]', 'a'>>('/test/[a]/[b]');
    // @ts-expect-error: PathWithSlug fails if the slug-id is not in the path.
    expectType<PathWithSlug<'/test/[a]/[b]', 'c'>>('/test/[a]/[b]');
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

  describe('CreatePage', () => {
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
    });
  });
  describe('CreateLayout', () => {
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
  assert(defineRouterMock.mock.calls[0]?.[0].getPathConfig);
  assert(defineRouterMock.mock.calls[0]?.[0].renderRoute);
  return {
    getPathConfig: defineRouterMock.mock.calls[0][0].getPathConfig,
    renderRoute: defineRouterMock.mock.calls[0][0].renderRoute,
  };
}

describe('createPages', () => {
  it('creates a simple static page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => [
      createPage({
        render: 'static',
        path: '/test',
        component: TestPage,
      }),
    ]);
    const { getPathConfig, renderRoute } = injectedFunctions();

    expect(await getPathConfig()).toEqual([
      {
        elements: {
          root: { isStatic: true },
          'page:/test': { isStatic: true },
        },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          {
            name: 'test',
            type: 'literal',
          },
        ],
        pattern: '^/test$',
      },
    ]);

    const route = await renderRoute('/test', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['root', 'page:/test']);
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
    const { getPathConfig, renderRoute } = injectedFunctions();
    expect(await getPathConfig()).toEqual([
      {
        elements: {
          root: { isStatic: true },
          'page:/test': { isStatic: false },
        },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          {
            name: 'test',
            type: 'literal',
          },
        ],
        pattern: '^/test$',
      },
    ]);
    const route = await renderRoute('/test', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['root', 'page:/test']);
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

    const { getPathConfig, renderRoute } = injectedFunctions();
    expect(await getPathConfig()).toEqual([
      {
        elements: {
          'layout:/': { isStatic: true },
          root: { isStatic: true },
          'page:/test': { isStatic: true },
        },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          {
            name: 'test',
            type: 'literal',
          },
        ],
        pattern: '^/test$',
      },
    ]);
    const route = await renderRoute('/test', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual([
      'root',
      'page:/test',
      'layout:/',
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

    const { getPathConfig, renderRoute } = injectedFunctions();
    expect(await getPathConfig()).toEqual([
      {
        elements: {
          'layout:/': { isStatic: false },
          root: { isStatic: true },
          'page:/test': { isStatic: false },
        },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          {
            name: 'test',
            type: 'literal',
          },
        ],
        pattern: '^/test$',
      },
    ]);

    const route = await renderRoute('/test', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual([
      'root',
      'page:/test',
      'layout:/',
    ]);
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
    const { getPathConfig, renderRoute } = injectedFunctions();
    expect(await getPathConfig()).toEqual([
      {
        elements: {
          root: { isStatic: true },
          'page:/test/nested': { isStatic: true },
        },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          {
            name: 'test',
            type: 'literal',
          },
          {
            name: 'nested',
            type: 'literal',
          },
        ],
        pattern: '^/test/nested$',
      },
    ]);
    const route = await renderRoute('/test/nested', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['root', 'page:/test/nested']);
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
    const { getPathConfig, renderRoute } = injectedFunctions();
    expect(await getPathConfig()).toEqual([
      {
        elements: {
          root: { isStatic: true },
          'page:/test/nested': { isStatic: false },
        },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          {
            name: 'test',
            type: 'literal',
          },
          {
            name: 'nested',
            type: 'literal',
          },
        ],
        pattern: '^/test/nested$',
      },
    ]);

    const route = await renderRoute('/test/nested', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['root', 'page:/test/nested']);
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
    const { getPathConfig, renderRoute } = injectedFunctions();
    expect(await getPathConfig()).toEqual([
      {
        elements: {
          root: { isStatic: true },
          'page:/test/w/x': { isStatic: true },
        },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          {
            name: 'test',
            type: 'literal',
          },
          {
            name: 'w',
            type: 'literal',
          },
          {
            name: 'x',
            type: 'literal',
          },
        ],
        pattern: '^/test/([^/]+)/([^/]+)$',
      },
      {
        elements: {
          root: { isStatic: true },
          'page:/test/y/z': { isStatic: true },
        },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          {
            name: 'test',
            type: 'literal',
          },
          {
            name: 'y',
            type: 'literal',
          },
          {
            name: 'z',
            type: 'literal',
          },
        ],
        pattern: '^/test/([^/]+)/([^/]+)$',
      },
    ]);
    const route = await renderRoute('/test/y/z', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['root', 'page:/test/y/z']);
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
    const { getPathConfig, renderRoute } = injectedFunctions();
    expect(await getPathConfig()).toEqual([
      {
        elements: {
          root: { isStatic: true },
          'page:/test/[a]/[b]': { isStatic: false },
        },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          {
            name: 'test',
            type: 'literal',
          },
          {
            name: 'a',
            type: 'group',
          },
          {
            name: 'b',
            type: 'group',
          },
        ],
        pattern: '^/test/([^/]+)/([^/]+)$',
      },
    ]);
    const route = await renderRoute('/test/w/x', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['root', 'page:/test/[a]/[b]']);
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
    const { getPathConfig, renderRoute } = injectedFunctions();
    expect(await getPathConfig()).toEqual([
      {
        elements: {
          root: { isStatic: true },
          'page:/test/a/b': { isStatic: true },
        },
        routeElement: { isStatic: true },
        noSsr: false,
        path: [
          {
            name: 'test',
            type: 'literal',
          },
          {
            name: 'a',
            type: 'literal',
          },
          {
            name: 'b',
            type: 'literal',
          },
        ],
        pattern: '^/test/(.*)$',
      },
    ]);
    const route = await renderRoute('/test/a/b', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual(['root', 'page:/test/a/b']);
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
    const { getPathConfig, renderRoute } = injectedFunctions();
    expect(await getPathConfig()).toEqual([
      {
        routeElement: { isStatic: true },
        elements: {
          root: { isStatic: true },
          'page:/test/[...path]': { isStatic: false },
        },
        noSsr: false,
        path: [
          {
            name: 'test',
            type: 'literal',
          },
          {
            name: 'path',
            type: 'wildcard',
          },
        ],
        pattern: '^/test/(.*)$',
      },
    ]);
    const route = await renderRoute('/test/a/b', {
      query: '?skip=[]',
    });
    expect(route).toBeDefined();
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual([
      'root',
      'page:/test/[...path]',
    ]);
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
    const { getPathConfig } = injectedFunctions();
    await expect(getPathConfig).rejects.toThrowError(
      'staticPaths does not match with slug pattern',
    );
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
    const { getPathConfig } = injectedFunctions();
    expect(await getPathConfig()).toEqual([
      {
        routeElement: { isStatic: true },
        elements: {
          root: { isStatic: true },
          'page:/static': { isStatic: true },
        },
        noSsr: true,
        path: [
          {
            name: 'static',
            type: 'literal',
          },
        ],
        pattern: '^/static$',
      },
      {
        routeElement: { isStatic: true },
        elements: {
          root: { isStatic: true },
          'page:/dynamic': { isStatic: false },
        },
        noSsr: true,
        path: [
          {
            name: 'dynamic',
            type: 'literal',
          },
        ],
        pattern: '^/dynamic$',
      },
    ]);
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
    const { getPathConfig } = injectedFunctions();
    await expect(getPathConfig).rejects.toThrowError(
      'Duplicated dynamic path: /test',
    );
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
    const { getPathConfig } = injectedFunctions();
    await expect(getPathConfig).rejects.toThrowError(
      'Duplicated component for: test/page',
    );
  });

  it.fails(
    'fails if duplicated static and dynamic paths override each other',
    async () => {
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
      const { getPathConfig } = injectedFunctions();
      await expect(getPathConfig).rejects.toThrowError(
        'Duplicated component for: test/page',
      );
    },
  );

  it('creates a complex router', async () => {
    const TestPage = vi.fn();
    complexTestRouter(createPages, TestPage);

    const { getPathConfig, renderRoute } = injectedFunctions();

    expect(await getPathConfig()).toEqual([
      {
        elements: {
          root: { isStatic: true },
          'page:/client/static': { isStatic: true },
        },
        routeElement: { isStatic: true },
        pattern: '^/client/static$',
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
        noSsr: false,
      },
      {
        elements: {
          root: { isStatic: true },
          'page:/server/static/static-echo': { isStatic: true },
        },
        routeElement: { isStatic: true },
        pattern: '^/server/static/([^/]+)$',
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
        noSsr: false,
      },
      {
        elements: {
          root: { isStatic: true },
          'page:/server/static/static-echo-2': { isStatic: true },
        },
        routeElement: { isStatic: true },
        pattern: '^/server/static/([^/]+)$',
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
        noSsr: false,
      },
      {
        elements: {
          root: { isStatic: true },
          'page:/server/static/static-echo/static-echo-2': { isStatic: true },
        },
        routeElement: { isStatic: true },
        pattern: '^/server/static/([^/]+)/([^/]+)$',
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
        noSsr: false,
      },
      {
        elements: {
          root: { isStatic: true },
          'page:/server/static/hello/hello-2': { isStatic: true },
        },
        routeElement: { isStatic: true },
        pattern: '^/server/static/([^/]+)/([^/]+)$',
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
        noSsr: false,
      },
      {
        elements: {
          root: { isStatic: true },
          'page:/static/wild/bar': { isStatic: true },
        },
        routeElement: { isStatic: true },
        pattern: '^/static/wild/(.*)$',
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
        noSsr: false,
      },
      {
        elements: {
          root: { isStatic: true },
          'page:/static/wild/hello/hello-2': { isStatic: true },
        },
        routeElement: { isStatic: true },
        pattern: '^/static/wild/(.*)$',
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
        noSsr: false,
      },
      {
        elements: {
          root: { isStatic: true },
          'page:/static/wild/foo/foo-2/foo-3': { isStatic: true },
        },
        routeElement: { isStatic: true },
        pattern: '^/static/wild/(.*)$',
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
        noSsr: false,
      },
      {
        elements: {
          root: { isStatic: true },
          'page:/client/dynamic': { isStatic: false },
        },
        routeElement: { isStatic: true },
        pattern: '^/client/dynamic$',
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
        noSsr: false,
      },
      {
        elements: {
          root: { isStatic: true },
          'page:/server/one/[echo]': { isStatic: false },
        },
        routeElement: { isStatic: true },
        pattern: '^/server/one/([^/]+)$',
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
        noSsr: false,
      },
      {
        elements: {
          root: { isStatic: true },
          'page:/server/two/[echo]/[echo2]': { isStatic: false },
        },
        routeElement: { isStatic: true },
        pattern: '^/server/two/([^/]+)/([^/]+)$',
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
        noSsr: false,
      },
      {
        elements: {
          root: { isStatic: true },
          'page:/server/wild/[...wild]': { isStatic: false },
        },
        routeElement: { isStatic: true },
        pattern: '^/server/wild/(.*)$',
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
        noSsr: false,
      },
      {
        elements: {
          root: { isStatic: true },
          'page:/server/oneAndWild/[slug]/[...wild]': { isStatic: false },
        },
        routeElement: { isStatic: true },
        pattern: '^/server/oneAndWild/([^/]+)/(.*)$',
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
        noSsr: false,
      },
    ]);
    const route = await renderRoute('/server/two/a/b', {
      query: '?skip=[]',
    });
    assert(route);
    expect(route.routeElement).toBeDefined();
    expect(Object.keys(route.elements)).toEqual([
      'root',
      'page:/server/two/[echo]/[echo2]',
    ]);
  });
});
