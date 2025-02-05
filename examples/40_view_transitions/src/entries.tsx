import { createPages } from 'waku/router/server';
import type { PathsForPages } from 'waku/router';

import HomePage from './components/HomePage';
import AboutPage from './components/AboutPage';
import RootLayout from './components/RootLayout';

const pages = createPages(async ({ createPage, createLayout }) => [
  createLayout({
    render: 'static',
    path: '/',
    component: RootLayout,
  }),

  createPage({
    render: 'static',
    path: '/',
    component: HomePage,
  }),

  createPage({
    render: 'static',
    path: '/about',
    component: AboutPage,
  }),
]);

declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<typeof pages>;
  }
}

export default pages;
