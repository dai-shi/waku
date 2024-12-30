import { createPages } from 'waku/router/server';
import type { PathsForPages } from 'waku/router';
import FooPage from './components/FooPage';
import BarPage from './components/BarPage';
import BarLayout from './components/BarLayout';
import FooLayout from './components/FooLayout';
import HomeLayout from './components/HomeLayout';
import HomePage from './components/HomePage';

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
