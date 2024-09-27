import { createPages } from 'waku';
import type { PathsForPages } from 'waku/router';

import _Layout from './pages/_layout';
import Bar from './pages/bar';
import FooIndex from './pages/foo/index';
import Index from './pages/index';
import Layout from './pages/layout';
import NestedSlugName from './pages/nested/[name]';

const _pages = createPages(async (pagesFns) => [
  pagesFns.createLayout({ path: '/', component: _Layout, render: 'static' }),
  pagesFns.createPage({ path: '/bar', component: Bar, render: 'dynamic' }),
  pagesFns.createPage({
    path: '/foo/',
    component: FooIndex,
    render: 'dynamic',
  }),
  pagesFns.createPage({ path: '/', component: Index, render: 'dynamic' }),
  pagesFns.createPage({
    path: '/layout',
    component: Layout,
    render: 'dynamic',
  }),
  pagesFns.createPage({
    path: '/nested/[name]',
    component: NestedSlugName,
    render: 'dynamic',
  }),
]);

declare module 'waku/router' {
  interface RouteConfig {
    paths: PathsForPages<typeof _pages>;
  }
}

export default _pages;
