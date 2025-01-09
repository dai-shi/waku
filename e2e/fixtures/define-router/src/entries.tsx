import type { ReactNode } from 'react';
import { unstable_defineRouter as defineRouter } from 'waku/router/server';
import { Slot, Children } from 'waku/minimal/client';

import Layout from './routes/layout.js';
import Page from './routes/page.js';
import FooPage from './routes/foo/page.js';
import { readFile } from 'node:fs/promises';

const STATIC_PATHS = ['/', '/foo'];
const PATH_PAGE: Record<string, ReactNode> = {
  '/': <Page />,
  '/foo': <FooPage />,
};

const router: ReturnType<typeof defineRouter> = defineRouter({
  getRouteConfig: async () =>
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
  handleRoute: async (path) => {
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
  getApiConfig: async () => [
    {
      path: [
        { type: 'literal', name: 'api' },
        { type: 'literal', name: 'hi' },
      ],
      isStatic: true,
    },
    {
      path: [
        { type: 'literal', name: 'api' },
        { type: 'literal', name: 'hi.txt' },
      ],
      isStatic: false,
    },
    {
      path: [
        { type: 'literal', name: 'api' },
        { type: 'literal', name: 'empty' },
      ],
      isStatic: true,
    },
  ],
  handleApi: async (path) => {
    if (path === '/api/hi.txt') {
      const hiTxt = await readFile('./private/hi.txt');

      return {
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(hiTxt);
            controller.close();
          },
        }),
      };
    } else if (path === '/api/hi') {
      return {
        status: 200,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('hello world!'));
            controller.close();
          },
        }),
      };
    } else if (path === '/api/empty') {
      return {
        status: 200,
      };
    }
    return {
      status: 404,
    };
  },
});

export default router;
