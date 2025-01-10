import { createPages } from 'waku';
import type { PathsForPages } from 'waku/router';

import FooPage from './components/FooPage';
import HomeLayout from './components/HomeLayout';
import HomePage from './components/HomePage';
import BarPage from './components/BarPage';
import NestedBazPage from './components/NestedBazPage';
import NestedQuxPage from './components/NestedQuxPage';
import Root from './components/Root';
import NestedLayout from './components/NestedLayout';
import { DeeplyNestedLayout } from './components/DeeplyNestedLayout';
import { readFile } from 'node:fs/promises';

const pages = createPages(
  async ({ createPage, createLayout, createRoot, createApi }) => [
    createRoot({
      render: 'static',
      component: Root,
    }),

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
      render: 'static',
      path: '/bar',
      component: BarPage,
    }),

    createPage({
      render: 'dynamic',
      path: '/baz',
      // Inline component is also possible.
      component: () => <h2>Dynamic: Baz</h2>,
    }),

    createPage({
      render: 'dynamic',
      path: '/nested/baz',
      component: NestedBazPage,
    }),

    createPage({
      render: 'static',
      path: '/nested/qux',
      component: NestedQuxPage,
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
      mode: 'static',
      method: 'GET',
      handler: async () => {
        const hiTxt = await readFile('./private/hi.txt');
        return new Response(hiTxt);
      },
    }),

    createApi({
      path: '/api/hi',
      mode: 'static',
      method: 'GET',
      handler: async () => {
        return new Response('hello world!');
      },
    }),

    createApi({
      path: '/api/empty',
      mode: 'static',
      method: 'GET',
      handler: async () => {
        return new Response(null, {
          status: 200,
        });
      },
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

export default pages;
