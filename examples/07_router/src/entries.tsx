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
    path: '/',
    component: () => (
      <HomeLayout>
        <HomePage />
      </HomeLayout>
    ),
  });

  createPage({
    path: '/foo',
    component: () => (
      <HomeLayout>
        <FooPage />
      </HomeLayout>
    ),
  });

  createPage({
    path: '/bar',
    component: () => (
      <HomeLayout>
        <BarPage />
      </HomeLayout>
    ),
  });

  createPage({
    path: '/nested/baz',
    component: () => (
      <HomeLayout>
        <NestedBazPage />
      </HomeLayout>
    ),
  });

  createPage({
    path: '/nested/qux',
    component: () => (
      <HomeLayout>
        <NestedQuxPage />
      </HomeLayout>
    ),
  });
});
