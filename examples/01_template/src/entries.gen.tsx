import { createPages } from 'waku';
import type { PathsForPages } from 'waku/router';

import _Layout, { getConfig as _Layout_getConfig } from './pages/_layout';
import About, { getConfig as About_getConfig } from './pages/about';
import Index, { getConfig as Index_getConfig } from './pages/index';

const _pages = createPages(async (pagesFns) => [
  pagesFns.createLayout({
    path: '/',
    component: _Layout,
    ...(await _Layout_getConfig()),
  }),
  pagesFns.createPage({
    path: '/about',
    component: About,
    ...(await About_getConfig()),
  }),
  pagesFns.createPage({
    path: '/',
    component: Index,
    ...(await Index_getConfig()),
  }),
]);

declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<typeof _pages>;
  }
}

export default _pages;
