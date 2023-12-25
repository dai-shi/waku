import { lazy } from 'react';
import { createPages } from 'waku/router/server';

// The use of `lazy` is optional and you can use import statements too.
const HomeLayout = lazy(() => import('./components/HomeLayout.js'));
const HomePage = lazy(() => import('./components/HomePage.js'));
const FooPage = lazy(() => import('./components/FooPage.js'));
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
    path: '/',
    component: HomePage,
  });

  createPage({
    render: 'static',
    path: '/foo',
    component: FooPage,
  });

  createPage({
    render: 'static',
    path: '/bar',
    component: BarPage,
  });

  createPage({
    render: 'static',
    path: '/nested/baz',
    component: NestedBazPage,
  });

  createPage({
    render: 'static',
    path: '/nested/qux',
    // Inline component is also supported.
    component: () => <NestedQuxPage />,
  });
});
