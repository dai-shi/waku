import { expect, vi, describe, it, beforeEach, assert } from 'vitest';
import type { MockedFunction } from 'vitest';
import { createPages } from '../src/router/create-pages.js';
import type {
  CreateLayout,
  CreatePage,
  GetSlugs,
  HasSlugInPath,
  HasWildcardInPath,
  IsValidPathInSlugPath,
  PathWithoutSlug,
  PathWithSlug,
  PathWithWildcard,
  StaticSlugRoutePathsTuple,
} from '../src/router/create-pages.js';
import { unstable_defineRouter } from '../src/router/define-router.js';
import { createElement } from 'react';
import type { PropsWithChildren } from 'react';
import { renderToString } from 'react-dom/server';
import { expectType } from 'ts-expect';

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
  assert(defineRouterMock.mock.calls[0]?.[0]);
  assert(defineRouterMock.mock.calls[0]?.[1]);
  return {
    getPathConfig: defineRouterMock.mock.calls[0][0],
    getComponent: defineRouterMock.mock.calls[0][1],
  };
}

describe('createPages', () => {
  it('creates a simple static page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => {
      createPage({
        render: 'static',
        path: '/test',
        component: TestPage,
      });
    });
    const { getPathConfig, getComponent } = injectedFunctions();

    expect(await getPathConfig!()).toEqual([
      {
        data: undefined,
        isStatic: true,
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

    const setComponentConfig = vi.fn();

    expect(
      await getComponent!('test/page', {
        unstable_setComponentConfig: setComponentConfig,
        unstable_buildConfig: undefined,
      }),
    ).toBe(TestPage);
    expect(setComponentConfig).toHaveBeenCalledTimes(1);
    expect(setComponentConfig).toHaveBeenCalledWith('static');
  });

  it('creates a simple dynamic page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => {
      createPage({
        render: 'dynamic',
        path: '/test',
        component: TestPage,
      });
    });
    const { getPathConfig, getComponent } = injectedFunctions();
    expect(await getPathConfig!()).toEqual([
      {
        data: undefined,
        isStatic: false,
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
    const setComponentConfig = vi.fn();
    expect(
      await getComponent('test/page', {
        unstable_setComponentConfig: setComponentConfig,
        unstable_buildConfig: undefined,
      }),
    ).toBe(TestPage);
    expect(setComponentConfig).toHaveBeenCalledTimes(1);
    expect(setComponentConfig).toHaveBeenCalledWith('dynamic');
  });

  it('creates a simple static page with a layout', async () => {
    const TestPage = () => null;
    const TestLayout = ({ children }: PropsWithChildren) => children;
    createPages(async ({ createPage, createLayout }) => {
      createLayout({
        render: 'static',
        path: '/',
        component: TestLayout,
      });
      createPage({
        render: 'static',
        path: '/test',
        component: TestPage,
      });
    });

    const { getPathConfig, getComponent } = injectedFunctions();
    expect(await getPathConfig!()).toEqual([
      {
        data: undefined,
        isStatic: true,
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

    const setComponentConfig = vi.fn();
    expect(
      await getComponent('test/page', {
        unstable_setComponentConfig: setComponentConfig,
        unstable_buildConfig: undefined,
      }),
    ).toBe(TestPage);
    expect(setComponentConfig).toHaveBeenCalledTimes(1);
    expect(setComponentConfig).toHaveBeenCalledWith('static');

    const setComponentConfigLayout = vi.fn();
    expect(
      await getComponent('layout', {
        unstable_setComponentConfig: setComponentConfigLayout,
        unstable_buildConfig: undefined,
      }),
    ).toBe(TestLayout);
    expect(setComponentConfigLayout).toHaveBeenCalledTimes(1);
    expect(setComponentConfigLayout).toHaveBeenCalledWith('static');
  });

  it('creates a simple dynamic page with a layout', async () => {
    const TestPage = () => null;
    const TestLayout = ({ children }: PropsWithChildren) => children;
    createPages(async ({ createPage, createLayout }) => {
      createLayout({
        render: 'dynamic',
        path: '/',
        component: TestLayout,
      });
      createPage({
        render: 'dynamic',
        path: '/test',
        component: TestPage,
      });
    });

    const { getPathConfig, getComponent } = injectedFunctions();
    expect(await getPathConfig!()).toEqual([
      {
        data: undefined,
        isStatic: false,
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

    const setComponentConfig = vi.fn();
    expect(
      await getComponent('test/page', {
        unstable_setComponentConfig: setComponentConfig,
        unstable_buildConfig: undefined,
      }),
    ).toBe(TestPage);
    expect(setComponentConfig).toHaveBeenCalledTimes(1);
    expect(setComponentConfig).toHaveBeenCalledWith('dynamic');

    const setComponentConfigLayout = vi.fn();
    expect(
      await getComponent('layout', {
        unstable_setComponentConfig: setComponentConfigLayout,
        unstable_buildConfig: undefined,
      }),
    ).toBe(TestLayout);
    expect(setComponentConfigLayout).toHaveBeenCalledTimes(1);
    expect(setComponentConfigLayout).toHaveBeenCalledWith('dynamic');
  });

  it('creates a nested static page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => {
      createPage({
        render: 'static',
        path: '/test/nested',
        component: TestPage,
      });
    });
    const { getPathConfig, getComponent } = injectedFunctions();
    expect(await getPathConfig!()).toEqual([
      {
        data: undefined,
        isStatic: true,
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
    const setComponentConfig = vi.fn();
    expect(
      await getComponent('test/nested/page', {
        unstable_setComponentConfig: setComponentConfig,
        unstable_buildConfig: undefined,
      }),
    ).toBe(TestPage);
    expect(setComponentConfig).toHaveBeenCalledTimes(1);
    expect(setComponentConfig).toHaveBeenCalledWith('static');
  });

  it('creates a nested dynamic page', async () => {
    const TestPage = () => null;
    createPages(async ({ createPage }) => {
      createPage({
        render: 'dynamic',
        path: '/test/nested',
        component: TestPage,
      });
    });
    const { getPathConfig, getComponent } = injectedFunctions();
    expect(await getPathConfig!()).toEqual([
      {
        data: undefined,
        isStatic: false,
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
    const setComponentConfig = vi.fn();
    expect(
      await getComponent('test/nested/page', {
        unstable_setComponentConfig: setComponentConfig,
        unstable_buildConfig: undefined,
      }),
    ).toBe(TestPage);
    expect(setComponentConfig).toHaveBeenCalledTimes(1);
    expect(setComponentConfig).toHaveBeenCalledWith('dynamic');
  });

  it('creates a static page with slugs', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => {
      createPage({
        render: 'static',
        path: '/test/[a]/[b]',
        staticPaths: [
          ['w', 'x'],
          ['y', 'z'],
        ],
        component: TestPage,
      });
    });
    const { getPathConfig, getComponent } = injectedFunctions();
    expect(await getPathConfig!()).toEqual([
      {
        data: undefined,
        isStatic: true,
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
        data: undefined,
        isStatic: true,
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
    const setComponentConfig = vi.fn();
    const WrappedComponent = await getComponent('test/w/x/page', {
      unstable_setComponentConfig: setComponentConfig,
      unstable_buildConfig: undefined,
    });
    assert(WrappedComponent);
    expect(setComponentConfig).toHaveBeenCalledTimes(1);
    expect(setComponentConfig).toHaveBeenCalledWith('static');
    renderToString(createElement(WrappedComponent as any));
    expect(TestPage).toHaveBeenCalledTimes(1);
    expect(TestPage).toHaveBeenCalledWith({ a: 'w', b: 'x' }, undefined);
  });

  it('creates a dynamic page with slugs', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => {
      createPage({
        render: 'dynamic',
        path: '/test/[a]/[b]',
        component: TestPage,
      });
    });
    const { getPathConfig, getComponent } = injectedFunctions();
    expect(await getPathConfig!()).toEqual([
      {
        data: undefined,
        isStatic: false,
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
    const setComponentConfig = vi.fn();
    const WrappedComponent = await getComponent('test/w/x/page', {
      unstable_setComponentConfig: setComponentConfig,
      unstable_buildConfig: undefined,
    });
    assert(WrappedComponent);
    expect(setComponentConfig).toHaveBeenCalledTimes(1);
    expect(setComponentConfig).toHaveBeenCalledWith('dynamic');
    renderToString(createElement(WrappedComponent as any));
    expect(TestPage).toHaveBeenCalledTimes(1);
    expect(TestPage).toHaveBeenCalledWith({ a: 'w', b: 'x' }, undefined);
  });

  it('creates a static page with wildcards', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => {
      createPage({
        render: 'static',
        path: '/test/[...path]',
        staticPaths: [['a', 'b']],
        component: TestPage,
      });
    });
    const { getPathConfig, getComponent } = injectedFunctions();
    expect(await getPathConfig!()).toEqual([
      {
        data: undefined,
        isStatic: true,
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
    const setComponentConfig = vi.fn();
    const WrappedComponent = await getComponent('test/a/b/page', {
      unstable_setComponentConfig: setComponentConfig,
      unstable_buildConfig: undefined,
    });
    assert(WrappedComponent);
    expect(setComponentConfig).toHaveBeenCalledTimes(1);
    expect(setComponentConfig).toHaveBeenCalledWith('static');
    renderToString(createElement(WrappedComponent as any));
    expect(TestPage).toHaveBeenCalledTimes(1);
    expect(TestPage).toHaveBeenCalledWith({ path: ['a', 'b'] }, undefined);
  });

  it('creates a dynamic page with wildcards', async () => {
    const TestPage = vi.fn();
    createPages(async ({ createPage }) => {
      createPage({
        render: 'dynamic',
        path: '/test/[...path]',
        component: TestPage,
      });
    });
    const { getPathConfig, getComponent } = injectedFunctions();
    expect(await getPathConfig!()).toEqual([
      {
        data: undefined,
        isStatic: false,
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
    const setComponentConfig = vi.fn();
    const WrappedComponent = await getComponent('test/a/b/page', {
      unstable_setComponentConfig: setComponentConfig,
      unstable_buildConfig: undefined,
    });
    assert(WrappedComponent);
    expect(setComponentConfig).toHaveBeenCalledTimes(1);
    expect(setComponentConfig).toHaveBeenCalledWith('dynamic');
    renderToString(createElement(WrappedComponent as any));
    expect(TestPage).toHaveBeenCalledTimes(1);
    expect(TestPage).toHaveBeenCalledWith({ path: ['a', 'b'] }, undefined);
  });

  it('fails if static paths do not match the slug pattern', async () => {
    createPages(async ({ createPage }) => {
      createPage({
        render: 'static',
        path: '/test/[a]/[b]',
        // @ts-expect-error: staticPaths should be an array of strings or [string, string][]
        staticPaths: [['w']],
        component: () => null,
      });
    });
    const { getPathConfig } = injectedFunctions();
    await expect(getPathConfig).rejects.toThrowError(
      'staticPaths does not match with slug pattern',
    );
  });

  it('allows to disable SSR on static and dynamic pages', async () => {
    createPages(async ({ createPage }) => {
      createPage({
        render: 'static',
        path: '/static',
        component: () => null,
        unstable_disableSSR: true,
      });
      createPage({
        render: 'dynamic',
        path: '/dynamic',
        component: () => null,
        unstable_disableSSR: true,
      });
    });
    const { getPathConfig } = injectedFunctions();
    expect(await getPathConfig()).toEqual([
      {
        data: undefined,
        isStatic: true,
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
        data: undefined,
        isStatic: false,
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

  it('allows to inject build data', async () => {
    createPages(async ({ createPage, unstable_setBuildData }) => {
      unstable_setBuildData('/static', { foo: 'bar' });
      createPage({
        render: 'static',
        path: '/static',
        component: () => null,
      });
      createPage({
        render: 'dynamic',
        path: '/dynamic',
        component: () => null,
      });
    });
    const { getPathConfig } = injectedFunctions();
    expect(await getPathConfig()).toEqual([
      {
        data: { foo: 'bar' },
        isStatic: true,
        noSsr: false,
        path: [
          {
            name: 'static',
            type: 'literal',
          },
        ],
        pattern: '^/static$',
      },
      {
        data: undefined,
        isStatic: false,
        noSsr: false,
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
    createPages(async ({ createPage }) => {
      createPage({
        render: 'dynamic',
        path: '/test',
        component: () => null,
      });
      createPage({
        render: 'dynamic',
        path: '/test',
        component: () => null,
      });
    });
    const { getPathConfig } = injectedFunctions();
    await expect(getPathConfig).rejects.toThrowError(
      'Duplicated dynamic path: /test',
    );
  });

  it('fails if duplicated static paths are registered', async () => {
    createPages(async ({ createPage }) => {
      createPage({
        render: 'static',
        path: '/test',
        component: () => null,
      });
      createPage({
        render: 'static',
        path: '/test',
        component: () => null,
      });
    });
    const { getPathConfig } = injectedFunctions();
    await expect(getPathConfig).rejects.toThrowError(
      'Duplicated component for: test/page',
    );
  });

  // TODO: Should this not fail as well?
  it.fails(
    'fails if duplicated static and dynamic paths override each other',
    async () => {
      createPages(async ({ createPage }) => {
        createPage({
          render: 'dynamic',
          path: '/test',
          component: () => null,
        });
        createPage({
          render: 'static',
          path: '/test',
          component: () => null,
        });
      });
      const { getPathConfig } = injectedFunctions();
      await expect(getPathConfig).rejects.toThrowError(
        'Duplicated component for: test/page',
      );
    },
  );
});
