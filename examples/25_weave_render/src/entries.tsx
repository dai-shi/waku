import { lazy } from 'react';
import { createPages } from 'waku';
import type { PathsForPages } from 'waku/router';
import FooPage from './components/FooPage';
import BarPage from './components/BarPage';
import BarLayout from './components/BarLayout';
import FooLayout from './components/FooLayout';

// The use of `lazy` is optional and you can use import statements too.
const HomeLayout = lazy(() => import('./components/HomeLayout'));
const HomePage = lazy(() => import('./components/HomePage'));

const pages = createPages(async ({ createPage, createLayout }) => [
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

  createLayout({
    render: 'static',
    path: '/foo',
    component: FooLayout,
  }),

  createPage({
    render: 'dynamic',
    path: '/foo',
    component: FooPage,
  }),

  createLayout({
    render: 'dynamic',
    path: '/bar',
    component: BarLayout,
  }),

  createPage({
    render: 'static',
    path: '/bar',
    component: BarPage,
  }),
]);

declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<typeof pages>;
  }
}

export default pages;
