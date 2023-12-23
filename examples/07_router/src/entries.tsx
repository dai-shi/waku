import { lazy } from 'react';
import { createPages } from 'waku/router/server';

const HomeLayout = lazy(() => import('./components/HomeLayout.js'));
const HomePage = lazy(() => import('./components/HomePage.js'));
const FooPage = lazy(() => import('./components/FooPage.js'));
const BarPage = lazy(() => import('./components/BarPage.js'));
const NestedBazPage = lazy(() => import('./components/NestedBazPage.js'));
const NestedQuxPage = lazy(() => import('./components/NestedQuxPage.js'));

export default createPages(async ({ createPage }) => {
  createPage({
    render: 'static',
    path: '/',
    component: () => (
      <HomeLayout>
        <HomePage />
      </HomeLayout>
    ),
  });

  createPage({
    render: 'static',
    path: '/foo',
    component: () => (
      <HomeLayout>
        <FooPage />
      </HomeLayout>
    ),
  });

  createPage({
    render: 'static',
    path: '/bar',
    component: () => (
      <HomeLayout>
        <BarPage />
      </HomeLayout>
    ),
  });

  createPage({
    render: 'static',
    path: '/nested/baz',
    component: () => (
      <HomeLayout>
        <NestedBazPage />
      </HomeLayout>
    ),
  });

  createPage({
    render: 'static',
    path: '/nested/qux',
    component: () => (
      <HomeLayout>
        <NestedQuxPage />
      </HomeLayout>
    ),
  });
});
