import { lazy } from 'react';
import { createPages } from 'waku';
import type { PathsForPages } from 'waku/router';

import FooPage from './components/FooPage';

// The use of `lazy` is optional and you can use import statements too.
const HomeLayout = lazy(() => import('./components/HomeLayout'));
const HomePage = lazy(() => import('./components/HomePage'));
const BarPage = lazy(() => import('./components/BarPage'));
const NestedBazPage = lazy(() => import('./components/NestedBazPage'));
const NestedQuxPage = lazy(() => import('./components/NestedQuxPage'));

const pages = createPages(async ({ createPage, createLayout }) => [
  createLayout({
    render: 'static',
    path: '/',
    component: HomeLayout,
  }),

  createPage({
    render: 'static',
    // render: 'dynamic',
    path: '/',
    component: HomePage,
  }),

  createPage({
    render: 'static',
    // render: 'dynamic',
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
    render: 'static',
    path: '/nested/baz',
    component: NestedBazPage,
  }),

  createPage({
    render: 'static',
    path: '/nested/qux',
    component: NestedQuxPage,
  }),

  createPage({
    render: 'static',
    path: '/nested/[id]',
    staticPaths: ['foo', 'bar'],
    component: ({ id }: { id: string }) => (
      <>
        <h2>Nested</h2>
        <h3>Static: {id}</h3>
      </>
    ),
  }),

  createPage({
    render: 'dynamic',
    path: '/nested/[id]',
    component: ({ id }: { id: string }) => (
      <>
        <h2>Nested</h2>
        <h3>Dynamic: {id}</h3>
      </>
    ),
  }),

  createPage({
    render: 'dynamic',
    path: '/any/[...all]',
    component: ({ all }: { all: string[] }) => (
      <h2>Catch-all: {all.join('/')}</h2>
    ),
  }),

  // Custom Not Found page
  createPage({
    render: 'static',
    path: '/404',
    component: () => <h2>Not Found</h2>,
  }),
]);

declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<typeof pages>;
  }
}

export default pages;
