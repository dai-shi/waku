import { createPages } from 'waku/router/server';

import HomeLayout from './routes/layout.js';
import Home from './routes/page.js';
import Foo from './routes/foo/page.js';
import Bar from './routes/bar/page.js';
import NestedLayout from './routes/nested/layout.js';
import Baz from './routes/nested/baz/page.js';
import Qux from './routes/nested/qux/page.js';

export default createPages(async ({ createPage, createLayout }) => {
  createLayout({
    pathname: '/',
    component: HomeLayout,
  });

  createPage({
    path: '/',
    component: Home,
  });

  createPage({
    path: '/foo',
    component: Foo,
  });

  createPage({
    path: '/bar',
    component: Bar,
  });

  createLayout({
    pathname: '/nested',
    component: NestedLayout,
  });

  createPage({
    path: '/nested/baz',
    component: Baz,
  });

  createPage({
    path: '/nested/qux',
    component: Qux,
  });
});

// import { defineRouter } from 'waku/router/server';
//
// export default defineRouter(
//   // getRoutePaths
//   async () => ({
//     static: ['/', '/foo', '/bar', '/nested/baz', '/nested/qux'].map(
//       (pathname) => ({ pathname }),
//     ),
//   }),
//   // getComponent (id is "**/layout" or "**/page")
//   async (id) => {
//     switch (id) {
//       case 'layout':
//         return import('./routes/layout.js');
//       case 'page':
//         return import('./routes/page.js');
//       case 'foo/page':
//         return import('./routes/foo/page.js');
//       case 'bar/page':
//         return import('./routes/bar/page.js');
//       case 'nested/layout':
//         return import('./routes/nested/layout.js');
//       case 'nested/baz/page':
//         return import('./routes/nested/baz/page.js');
//       case 'nested/qux/page':
//         return import('./routes/nested/qux/page.js');
//       default:
//         return null;
//     }
//   },
// );
