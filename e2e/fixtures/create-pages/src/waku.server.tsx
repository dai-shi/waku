import { readFile } from 'node:fs/promises';
import { Slice } from 'waku';
import adapter from 'waku/adapters/default';
import type { PathsForPages } from 'waku/router';
import { createPages, unstable_redirect as redirect } from 'waku/router/server';
import { DeeplyNestedLayout } from './components/DeeplyNestedLayout.js';
import DynamicLayout from './components/DynamicLayout.js';
import ErrorPage from './components/ErrorPage.js';
import FooPage from './components/FooPage.js';
import HomeLayout from './components/HomeLayout.js';
import HomePage from './components/HomePage.js';
import {
  LongSuspenseLayout,
  SlowComponent,
  StaticLongSuspenseLayout,
} from './components/LongSuspenseLayout.js';
import NestedBazPage from './components/NestedBazPage.js';
import NestedLayout from './components/NestedLayout.js';
import NoSsr from './components/NoSsr.js';
import RedirectToSearchPage from './components/RedirectToSearchPage.js';
import { RerenderActionPage } from './components/RerenderActionPage.js';
import SearchPage from './components/SearchPage.js';
import { Slice001 } from './components/slice001.js';
import { Slice002 } from './components/slice002.js';
import { Slice003 } from './components/slice003.js';
import { demoSearchCodec } from './lib/search.js';

const renderLayoutProps = (title: string, testIdPrefix: string, props: any) => (
  <div>
    <h2>{title}</h2>
    <p data-testid={`${testIdPrefix}-keys`}>
      {Object.keys(props)
        .filter((key) => key !== 'children')
        .sort()
        .join(',') || 'none'}
    </p>
    <p data-testid={`${testIdPrefix}-bbb`}>{props.bbb ?? 'missing'}</p>
    <p data-testid={`${testIdPrefix}-ddd`}>{props.ddd ?? 'missing'}</p>
    <p data-testid={`${testIdPrefix}-fff`}>{props.fff ?? 'missing'}</p>
    <p data-testid={`${testIdPrefix}-lang`}>{props.lang ?? 'missing'}</p>
    <p data-testid={`${testIdPrefix}-section`}>{props.section ?? 'missing'}</p>
    <p data-testid={`${testIdPrefix}-slug`}>{props.slug ?? 'missing'}</p>
    {props.children}
  </div>
);

const pages: ReturnType<typeof createPages> = createPages(
  async ({ createPage, createLayout, createApi, createSlice }) => [
    createLayout({
      render: 'static',
      path: '/',
      component: HomeLayout,
    }),

    createPage({
      render: 'static',
      path: '/',
      component: HomePage,
    }),

    createPage({
      render: 'static',
      path: '/foo',
      component: FooPage,
    }),

    createPage({
      render: 'dynamic',
      path: '/search',
      component: SearchPage,
      unstable_searchCodec: demoSearchCodec,
    }),

    createPage({
      render: 'dynamic',
      path: '/redirect-to-search',
      component: RedirectToSearchPage,
    }),

    // a dynamic route that also has a search codec, to exercise the codec
    // resolver for a slug route end to end (see /redirect-to-item)
    createPage({
      render: 'dynamic',
      path: '/items/[id]',
      component: () => <p>Item</p>,
      unstable_searchCodec: demoSearchCodec,
    }),

    createPage({
      render: 'dynamic',
      path: '/redirect-to-item',
      component: () =>
        redirect({
          to: '/items/[id]',
          params: { id: '7' },
          search: { q: 'hi', page: 2 },
        }),
    }),

    createPage({
      render: 'dynamic',
      path: '/nested/baz',
      component: NestedBazPage,
    }),

    createLayout({
      render: 'static',
      path: '/nested',
      component: NestedLayout,
    }),

    createPage({
      render: 'static',
      path: '/nested/[id]',
      staticPaths: ['foo', 'bar'],
      component: ({ id }) => (
        <>
          <h2>Nested</h2>
          <h3>Static: {id}</h3>
        </>
      ),
    }),

    createPage({
      render: 'dynamic',
      path: '/wild/[...id]',
      component: ({ id }) => (
        <>
          <h2>Wildcard</h2>
          <h3>Slug: {id.join('/')}</h3>
        </>
      ),
    }),

    createLayout({
      render: 'static',
      path: '/nested/[id]',
      component: DeeplyNestedLayout,
    }),

    createPage({
      render: 'dynamic',
      path: '/nested/[id]',
      component: ({ id }) => (
        <>
          <h2>Nested</h2>
          <h3>Dynamic: {id}</h3>
        </>
      ),
    }),

    createPage({
      render: 'dynamic',
      path: '/error',
      component: ErrorPage,
    }),

    createLayout({
      render: 'static',
      path: '/long-suspense',
      component: LongSuspenseLayout,
    }),

    createPage({
      render: 'dynamic',
      path: '/long-suspense/1',
      component: () => (
        <SlowComponent>
          <h3>Long Suspense Page 1</h3>
        </SlowComponent>
      ),
    }),

    createPage({
      render: 'dynamic',
      path: '/long-suspense/2',
      component: () => (
        <SlowComponent>
          <h3>Long Suspense Page 2</h3>
        </SlowComponent>
      ),
    }),

    createPage({
      render: 'dynamic',
      path: '/long-suspense/3',
      component: () => (
        <SlowComponent>
          <h3>Long Suspense Page 3</h3>
        </SlowComponent>
      ),
    }),

    createLayout({
      render: 'static',
      path: '/static-long-suspense',
      component: StaticLongSuspenseLayout,
    }),

    createPage({
      render: 'static',
      path: '/static-long-suspense/4',
      component: () => (
        <SlowComponent>
          <h3>Long Suspense Page 4</h3>
        </SlowComponent>
      ),
    }),

    createPage({
      render: 'static',
      path: '/static-long-suspense/5',
      component: () => (
        <SlowComponent>
          <h3>Long Suspense Page 5</h3>
        </SlowComponent>
      ),
    }),

    createPage({
      render: 'static',
      path: '/static-long-suspense/6',
      component: () => (
        <SlowComponent>
          <h3>Long Suspense Page 6</h3>
        </SlowComponent>
      ),
    }),

    createPage({
      render: 'dynamic',
      path: '/any/[...all]',
      component: ({ all }) => <h2>Catch-all: {all.join('/')}</h2>,
    }),

    // Custom Not Found page
    createPage({
      render: 'static',
      path: '/404',
      component: () => <h2>Not Found</h2>,
    }),

    createApi({
      path: '/api/hi.txt',
      render: 'static',
      method: 'GET',
      handler: async () => {
        const hiTxt = await readFile('./private/hi.txt', 'utf-8');
        return new Response(hiTxt);
      },
    }),

    createApi({
      path: '/api/hi',
      render: 'dynamic',
      handlers: {
        GET: async () => {
          return new Response('hello world!');
        },
        POST: async (req) => {
          const body = await req.text();
          return new Response(`POST to hello world! ${body}`);
        },
      },
    }),

    createApi({
      path: '/api/url',
      render: 'dynamic',
      handlers: {
        GET: async (req) => {
          return new Response('url ' + req.url);
        },
      },
    }),

    createApi({
      path: '/api/empty',
      render: 'static',
      method: 'GET',
      handler: async () => {
        return new Response(null);
      },
    }),

    createApi({
      // Returns `Date.now()` at handler-evaluation time. Used by an
      // e2e test to detect whether the static API was pre-generated at
      // build (response < test's `curr`) or rendered live at runtime
      // (response > `curr`).
      path: '/api/cache-time',
      render: 'static',
      method: 'GET',
      handler: async () => {
        return new Response(String(Date.now()));
      },
    }),

    createApi({
      path: '/api/static-paths/[name]',
      render: 'static',
      method: 'GET',
      staticPaths: ['foo', 'bar.json'],
      handler: async (request) => {
        const url = new URL(request.url);
        const name = url.pathname.split('/').pop()!;
        return Response.json({ name });
      },
    }),

    createApi({
      path: '/api/form-data',
      render: 'dynamic',
      handlers: {
        POST: async (req) => {
          const formData = await req.formData();
          const keys = [...formData.keys()];
          const testString = formData.get('test-string');
          const testFile = formData.get('test-file') as File;
          return Response.json({
            keys,
            testString,
            testFile: {
              name: testFile.name,
              data: await testFile.text(),
            },
          });
        },
      },
    }),

    createApi({
      path: '/api/echo/[id]',
      render: 'dynamic',
      handlers: {
        GET: async (_req, apiContext) => {
          return Response.json({ params: apiContext.params });
        },
      },
    }),

    createApi({
      path: '/api/echo/[category]/[...rest]',
      render: 'dynamic',
      handlers: {
        GET: async (_req, apiContext) => {
          return Response.json({ params: apiContext.params });
        },
      },
    }),

    createApi({
      path: '/api/static-wildcard/[...slugs]',
      render: 'static',
      method: 'GET',
      staticPaths: [['a', 'b'], ['c']],
      handler: async (_req, ctx) => {
        return Response.json({ params: (ctx as any).params });
      },
    }),

    createPage({
      render: 'static',
      path: '/exact/[slug]/[...wild]',
      exactPath: true,
      component: () => <h1>EXACTLY!!</h1>,
    }),

    createPage({
      render: 'static',
      path: '/(group)/test',
      component: () => <h1>Group Page</h1>,
    }),

    // Should not show for /(group)/test
    createLayout({
      render: 'static',
      path: '/test',
      component: ({ children }) => (
        <div>
          <h2>/test Layout</h2>
          {children}
        </div>
      ),
    }),

    createLayout({
      render: 'static',
      path: '/(group)',
      component: ({ children }) => (
        <div>
          <h2>/(group) Layout</h2>
          {children}
        </div>
      ),
    }),

    createLayout({
      render: 'dynamic',
      path: '/dynamic',
      component: DynamicLayout,
    }),

    createPage({
      render: 'dynamic',
      path: '/dynamic',
      component: () => <h1>Dynamic Page</h1>,
    }),

    createPage({
      render: 'dynamic',
      path: '/rerender-action',
      component: RerenderActionPage,
    }),

    createLayout({
      render: 'dynamic',
      path: '/layout-props/dynamic/[lang]',
      component: ((props: any) =>
        renderLayoutProps(
          'Dynamic Parent Layout',
          'dynamic-layout-props',
          props,
        )) as any,
    }),

    createPage({
      render: 'dynamic',
      path: '/layout-props/dynamic/[lang]/[slug]',
      component: ({ slug }) => <h1>Dynamic Layout Props Page {slug}</h1>,
    }),

    createLayout({
      render: 'dynamic',
      path: '/layout-props/dynamic-complex/aaa/[bbb]/ccc/[ddd]',
      component: ((props: any) =>
        renderLayoutProps(
          'Dynamic Complex Layout',
          'dynamic-complex-layout-props',
          props,
        )) as any,
    }),

    createPage({
      render: 'dynamic',
      path: '/layout-props/dynamic-complex/aaa/[bbb]/ccc/[ddd]/eee/[fff]',
      component: ({ fff }) => <h1>Dynamic Complex Layout Props Page {fff}</h1>,
    }),

    createLayout({
      render: 'static',
      path: '/layout-props/static/[lang]',
      component: ((props: any) =>
        renderLayoutProps(
          'Static Parent Layout',
          'static-layout-props',
          props,
        )) as any,
    }),

    createPage({
      render: 'static',
      path: '/layout-props/static/[lang]/[slug]',
      staticPaths: [
        ['en', 'post-1'],
        ['fr', 'post-2'],
      ] as const,
      component: ({ slug }) => <h1>Static Layout Props Page {slug}</h1>,
    }),

    createLayout({
      render: 'static',
      path: '/(group)/layout-props/static-grouped/[lang]/[section]',
      component: ((props: any) =>
        renderLayoutProps(
          'Static Grouped Layout',
          'static-grouped-layout-props',
          props,
        )) as any,
    }),

    createPage({
      render: 'static',
      path: '/(group)/layout-props/static-grouped/[lang]/[section]/[slug]',
      staticPaths: [
        ['en', 'docs', 'post-1'],
        ['fr', 'blog', 'post-2'],
      ] as const,
      component: ({ slug }) => <h1>Static Grouped Layout Props Page {slug}</h1>,
    }),

    createLayout({
      render: 'dynamic',
      path: '/(dynamic)',
      component: ({ children }) => (
        <div>
          <h2>Dynamic Layout {new Date().toISOString()}</h2>
          {children}
        </div>
      ),
    }),
    createLayout({
      render: 'static',
      path: '/(dynamic)/(static)',
      component: ({ children }) => (
        <div>
          <h2>Static Layout {new Date().toISOString()}</h2>
          {children}
        </div>
      ),
    }),
    createPage({
      render: 'static',
      path: '/(dynamic)/(static)/nested-layouts',
      component: () => <h1>Nested Layouts page</h1>,
    }),

    createPage({
      render: 'static',
      path: '/no-ssr',
      component: NoSsr,
      unstable_disableSSR: true,
    }),

    createPage({
      render: 'dynamic',
      path: '/slices',
      slices: ['slice001', 'slice002'],
      component: () => (
        <>
          <h2>Slices</h2>
          <Slice id="slice001" />
          <Slice id="slice002" />
          <Slice
            id="slice003"
            lazy
            fallback={<p data-testid="slice003-loading">Loading...</p>}
          />
        </>
      ),
    }),

    createPage({
      render: 'static',
      path: '/static-slices',
      component: () => (
        <>
          <h2>Slices</h2>
          <Slice
            id="slice001"
            lazy
            fallback={<p data-testid="slice001-loading">Loading...</p>}
          />
        </>
      ),
    }),

    createSlice({
      render: 'static',
      component: Slice001,
      id: 'slice001',
    }),

    createPage({
      render: 'static',
      path: '/docs/[version]/read',
      staticPaths: ['v1.0.0', 'v2.1.5', 'Mr.-Mime'],
      component: ({ version }) => (
        <>
          <h2>Docs</h2>
          <h3>Version: {version}</h3>
        </>
      ),
    }),

    createSlice({
      render: 'dynamic',
      component: Slice002,
      id: 'slice002',
    }),

    createSlice({
      render: 'dynamic',
      component: Slice003,
      id: 'slice003',
    }),
  ],
);

declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<typeof pages>;
  }
  interface CreatePagesConfig {
    pages: typeof pages;
  }
}

export default adapter(pages);
