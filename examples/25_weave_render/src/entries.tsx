import { lazy } from 'react';
import { createPages } from 'waku';
import type { PathsForPages } from 'waku/router';
import FooPage from './components/FooPage';
import BarPage from './components/BarPage';
import NestedBarLayout from './components/NestedBarLayout';

// The use of `lazy` is optional and you can use import statements too.
const HomeLayout = lazy(() => import('./components/HomeLayout'));
const HomePage = lazy(() => import('./components/HomePage'));

const pages = createPages(async ({ createPage, createLayout }) => [
  createLayout({
    render: 'dynamic',
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
    path: '/nested/bar',
    component: BarPage,
  }),

  createLayout({
    render: 'static',
    path: '/nested',
    component: NestedBarLayout,
  }),
]);

declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<typeof pages>;
  }
}

export default pages;
