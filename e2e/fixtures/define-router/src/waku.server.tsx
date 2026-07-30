import type { ReactNode } from 'react';
import { readFile } from 'node:fs/promises';
// NOTE: I think we need one spec to use non-default adapter
import adapter from 'waku/adapters/node';
import { Children, Slot } from 'waku/minimal/client';
import {
  unstable_defineRouter as defineRouter,
  unstable_redirect as redirect,
} from 'waku/router/server';
import { Slice001 } from './components/slice001.js';
import { Slice002 } from './components/slice002.js';
import Bar1Page from './routes/bar1/page.js';
import Bar2Page from './routes/bar2/page.js';
import Baz1Page from './routes/baz1/page.js';
import Baz2Page from './routes/baz2/page.js';
import FooPage from './routes/foo/page.js';
import Layout from './routes/layout.js';
import Page from './routes/page.js';

const STATIC_PATHS = ['/', '/foo', '/baz2'];
const STATIC_PAGES = ['/', '/foo', '/bar2', '/baz2'];
const PATH_PAGE: Record<string, ReactNode> = {
  '/': <Page />,
  '/foo': <FooPage />,
  '/bar1': <Bar1Page />, // dynamic page + static slice
  '/bar2': <Bar2Page />, // static page + dynamic slice
  '/baz1': <Baz1Page />, // dynamic page + lazy static slice
  '/baz2': <Baz2Page />, // static page + lazy dynamic slice
};

const router: ReturnType<typeof defineRouter> = defineRouter({
  getConfigs: async () => [
    ...Object.keys(PATH_PAGE).map((path) => {
      return {
        type: 'route' as const,
        pattern: `^${path}$`,
        path: path
          .split('/')
          .filter(Boolean)
          .map((name) => ({ type: 'literal', name }) as const),
        isStatic: STATIC_PATHS.includes(path),
        ...(path === '/' ? { slices: ['slice001'] } : {}),
        ...(path === '/bar1' ? { slices: ['slice001'] } : {}),
        ...(path === '/bar2' ? { slices: ['slice002'] } : {}),
        rootElement: {
          isStatic: true,
          renderer: () => (
            <html>
              <head>
                <title>Waku example</title>
              </head>
              <body>
                <Children />
              </body>
            </html>
          ),
        },
        routeElement: {
          isStatic: true,
          renderer: () => (
            <Slot id="layout:/">
              <Slot id={`page:${path}`} />
            </Slot>
          ),
        },
        elements: {
          'layout:/': {
            isStatic: true,
            renderer: () => (
              <Layout>
                <Children />
              </Layout>
            ),
          },
          [`page:${path}`]: {
            isStatic: STATIC_PAGES.includes(path),
            renderer: () => PATH_PAGE[path],
          },
        },
      };
    }),
    {
      // the renderer throws before anything streams, so the rsc request is
      // answered with a real redirect that the browser has to follow
      type: 'route' as const,
      pattern: '^/moved$',
      path: [{ type: 'literal', name: 'moved' } as const],
      isStatic: false,
      rootElement: {
        isStatic: true,
        renderer: () => (
          <html>
            <head>
              <title>Waku example</title>
            </head>
            <body>
              <Children />
            </body>
          </html>
        ),
      },
      routeElement: {
        isStatic: false,
        renderer: () => {
          redirect('/foo');
        },
      },
      elements: {},
    },
    {
      type: 'api',
      path: [
        { type: 'literal', name: 'api' },
        { type: 'literal', name: 'hi' },
      ],
      isStatic: false,
      handler: async (req) => {
        if (req.method === 'GET') {
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('hello world!'));
                controller.close();
              },
            }),
          );
        }
        if (req.method === 'POST') {
          const bodyContent = await new Response(req.body).text();
          return new Response(
            new ReadableStream({
              start(controller) {
                controller.enqueue(
                  new TextEncoder().encode(
                    `POST to hello world! ${bodyContent}`,
                  ),
                );
                controller.close();
              },
            }),
          );
        }
        return new Response(null, {
          status: 404,
        });
      },
    },
    {
      type: 'api',
      path: [
        { type: 'literal', name: 'api' },
        { type: 'literal', name: 'hi.txt' },
      ],
      isStatic: false,
      handler: async () => {
        const hiTxt = await readFile('./private/hi.txt');
        return new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(hiTxt);
              controller.close();
            },
          }),
        );
      },
    },
    {
      type: 'api',
      path: [
        { type: 'literal', name: 'api' },
        { type: 'literal', name: 'empty' },
      ],
      isStatic: true,
      handler: async () => {
        return new Response(null, {
          status: 200,
        });
      },
    },
    {
      type: 'slice',
      id: 'slice001',
      isStatic: true,
      renderer: async () => <Slice001 />,
    },
    {
      type: 'slice',
      id: 'slice002',
      isStatic: false,
      renderer: async () => <Slice002 />,
    },
  ],
});

export default adapter(router);
