import type { ReactNode } from 'react';
import { unstable_defineRouter } from 'waku/router/server';
import { Slot, Children } from 'waku/minimal/client';
import { new_defineEntries } from 'waku/minimal/server';

import Layout from './routes/layout.js';
import Page from './routes/page.js';
import FooPage from './routes/foo/page.js';

const STATIC_PATHS = ['/', '/foo'];
const PATH_PAGE: Record<string, ReactNode> = {
  '/': <Page />,
  '/foo': <FooPage />,
};

const router: ReturnType<typeof unstable_defineRouter> = unstable_defineRouter({
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

const entries: ReturnType<typeof new_defineEntries> = new_defineEntries({
  unstable_handleRequest: async (input, utils) => {
    if (input.type === 'custom') {
      return null; // no ssr
    }
    return router.unstable_handleRequest(input, utils);
  },
  unstable_getBuildConfig: (utils) => {
    return router.unstable_getBuildConfig(utils);
  },
});

export default entries;
