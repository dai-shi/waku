import { lazy } from 'react';
import { createPages } from 'waku/router/server';

import FooPage from './components/FooPage.js';

// The use of `lazy` is optional and you can use import statements too.
const HomeLayout = lazy(() => import('./components/HomeLayout.js'));
const HomePage = lazy(() => import('./components/HomePage.js'));
const BarPage = lazy(() => import('./components/BarPage.js'));
const NestedBazPage = lazy(() => import('./components/NestedBazPage.js'));
const NestedQuxPage = lazy(() => import('./components/NestedQuxPage.js'));

export default createPages(async ({ createPage, createLayout }) => {
  createLayout({
    render: 'static',
    path: '/',
    component: HomeLayout,
  });

  createPage({
    render: 'static',
    // render: 'dynamic',
    path: '/',
    component: HomePage,
  });

  createPage({
    render: 'static',
    // render: 'dynamic',
    path: '/foo',
    component: FooPage,
  });

  createPage({
    render: 'static',
    path: '/bar',
    component: BarPage,
  });

  createPage({
    render: 'dynamic',
    path: '/baz',
    // Inline component is also possible.
    component: () => <h2>Dynamic: Baz</h2>,
  });

  createPage({
    render: 'static',
    path: '/nested/baz',
    component: NestedBazPage,
  });

  createPage({
    render: 'static',
    path: '/nested/qux',
    component: NestedQuxPage,
  });

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
  });

  createPage({
    render: 'dynamic',
    path: '/nested/[id]',
    component: ({ id }: { id: string }) => (
      <>
        <h2>Nested</h2>
        <h3>Dynamic: {id}</h3>
      </>
    ),
  });

  createPage({
    render: 'dynamic',
    path: '/any/[...all]',
    component: ({ all }: { all: string[] }) => (
      <h2>Catch-all: {all.join('/')}</h2>
    ),
  });

  // Custom Not Found page
  // TODO allow to change the status code to 404
  createPage({
    render: 'dynamic',
    path: '/[...all]',
    component: ({ all }: { all: string[] }) => (
      <h2>Not Found: {all.join('/')}</h2>
    ),
  });
});
