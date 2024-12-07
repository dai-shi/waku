import type { ReactNode } from 'react';
import { new_defineRouter } from 'waku/router/server';
import { Slot, Children } from 'waku/minimal/client';

import Layout from './routes/layout.js';
import Page from './routes/page.js';
import FooPage from './routes/foo/page.js';

const STATIC_PATHS = ['/', '/foo'];
const PATH_PAGE: Record<string, ReactNode> = {
  '/': <Page />,
  '/foo': <FooPage />,
};

export default new_defineRouter({
  getPathConfig: async () =>
    STATIC_PATHS.map((path) => ({
      pattern: `^${path}$`,
      path: path
        .split('/')
        .filter(Boolean)
        .map((name) => ({ type: 'literal', name })),
      routeElement: { isStatic: true },
      elements: {
        root: { isStatic: true },
        'layout:/': { isStatic: true },
        [`page:${path}`]: { isStatic: true },
      },
    })),
  renderRoute: async (path) => {
    if (!STATIC_PATHS.includes(path)) {
      throw new Error('renderRoute: No such path:' + path);
    }
    return {
      routeElement: (
        <Slot id="root">
          <Slot id="layout:/">
            <Slot id={`page:${path}`} />
          </Slot>
        </Slot>
      ),
      elements: {
        root: (
          <html>
            <head>
              <title>Waku example</title>
            </head>
            <body>
              <Children />
            </body>
          </html>
        ),
        'layout:/': (
          <Layout>
            <Children />
          </Layout>
        ),
        [`page:${path}`]: PATH_PAGE[path],
      },
    };
  },
});
