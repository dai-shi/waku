import type { ReactNode } from 'react';
import { readFile } from 'node:fs/promises';
// NOTE: I think we need one spec to use non-default adapter
import adapter from 'waku/adapters/node';
import {
  Children_UNSTABLE as Children,
  Slot_UNSTABLE as Slot,
} from 'waku/minimal/client';
import { Slice } from 'waku/router/client';
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

const STATIC_PAGES = ['/', '/foo', '/bar2', '/baz2', '/static-lazy'];
const PATH_PAGE: Record<string, ReactNode> = {
  '/': <Page />,
  '/foo': <FooPage />,
  '/bar1': <Bar1Page />, // dynamic page + static slice
  '/bar2': <Bar2Page />, // static page + dynamic slice
  '/baz1': <Baz1Page />, // dynamic page + lazy static slice
  '/baz2': <Baz2Page />, // static page + lazy dynamic slice
  '/static-lazy': (
    <div>
      <h2 data-testid="static-lazy-title">Static lazy</h2>
      <Slice id="slice001" lazy fallback={null} />
    </div>
  ),
};

const root = {
  immutable: true,
  render: () => (
    <html>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Waku example</title>
      </head>
      <body>
        <Children />
      </body>
    </html>
  ),
};

const sliceSources = {
  'slice:slice001': { immutable: true, render: () => <Slice001 /> },
  'slice:slice002': { render: () => <Slice002 /> },
};

const router = defineRouter({
  resolve: async (path) => {
    if (path === '/api/hi') {
      return async (req) => {
        if (req.method === 'GET') {
          return new Response('hello world!');
        }
        if (req.method === 'POST') {
          return new Response('POST to hello world! ' + (await req.text()));
        }
        return new Response(null, { status: 404 });
      };
    }
    if (path === '/api/hi.txt') {
      return async () => new Response(await readFile('./private/hi.txt'));
    }
    if (path === '/api/empty') {
      return async () => new Response(null, { status: 200 });
    }
    if (path === '/moved' || path === '/moved-hash') {
      return {
        elements: {
          root,
          route: {
            render: () => redirect(path === '/moved' ? '/foo' : '/foo#bottom'),
          },
        },
      };
    }
    if (!(path in PATH_PAGE)) {
      return null;
    }
    return {
      elements: {
        root,
        route: {
          immutable: true,
          render: () => (
            <Slot id="layout:/">
              <Slot id={`page:${path}`} />
            </Slot>
          ),
        },
        'layout:/': {
          immutable: true,
          render: () => (
            <Layout>
              <Children />
            </Layout>
          ),
        },
        [`page:${path}`]: {
          immutable: STATIC_PAGES.includes(path),
          render: () => PATH_PAGE[path],
        },
        ...(path === '/' || path === '/bar1'
          ? { 'slice:slice001': sliceSources['slice:slice001'] }
          : {}),
        ...(path === '/bar2'
          ? { 'slice:slice002': sliceSources['slice:slice002'] }
          : {}),
      },
    };
  },
  getBuildPaths: async () => [...Object.keys(PATH_PAGE), '/api/empty'],
  getBuildElementIds: async () => ['slice:slice001'],
  resolveElement: async (id) =>
    sliceSources[id as keyof typeof sliceSources] || null,
});

export default adapter(router);
