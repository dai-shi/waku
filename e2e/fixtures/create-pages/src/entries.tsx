import { createPages } from 'waku';

import FooPage from './components/FooPage.js';
import HomeLayout from './components/HomeLayout.js';
import HomePage from './components/HomePage.js';
import NestedBazPage from './components/NestedBazPage.js';
import Root from './components/Root.js';
import NestedLayout from './components/NestedLayout.js';
import { DeeplyNestedLayout } from './components/DeeplyNestedLayout.js';

const pages: ReturnType<typeof createPages> = createPages(
  async ({ createPage, createLayout, createRoot }) => [
    createRoot({
      render: 'static',
      component: Root,
    }),

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

    createPage({
      render: 'static',
      path: '/foo',
      component: FooPage,
    }),

    createPage({
      render: 'dynamic',
      path: '/nested/baz',
      component: NestedBazPage,
    }),

    createLayout({
      render: 'static',
      path: '/nested',
      component: NestedLayout,
    }),

    createPage({
      render: 'static',
      path: '/nested/[id]',
      staticPaths: ['foo', 'bar'],
      component: ({ id }) => (
        <>
          <h2>Nested</h2>
          <h3>Static: {id}</h3>
        </>
      ),
    }),

    createPage({
      render: 'dynamic',
      path: '/wild/[...id]',
      component: ({ id }) => (
        <>
          <h2>Wildcard</h2>
          <h3>Slug: {id.join('/')}</h3>
        </>
      ),
    }),

    createLayout({
      render: 'static',
      path: '/nested/[id]',
      component: DeeplyNestedLayout,
    }),

    createPage({
      render: 'dynamic',
      path: '/nested/[id]',
      component: ({ id }) => (
        <>
          <h2>Nested</h2>
          <h3>Dynamic: {id}</h3>
        </>
      ),
    }),

    createPage({
      render: 'dynamic',
      path: '/any/[...all]',
      component: ({ all }) => <h2>Catch-all: {all.join('/')}</h2>,
    }),

    // Custom Not Found page
    createPage({
      render: 'static',
      path: '/404',
      component: () => <h2>Not Found</h2>,
    }),
  ],
);

export default pages;
