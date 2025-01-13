import { unstable_defineRouter as defineRouter } from 'waku/router/server';
import { Slot, Children } from 'waku/minimal/client';

import Root from './components/Root';
import HomeLayout from './components/HomeLayout';
import HomePage from './components/HomePage';
import FooPage from './components/FooPage';
import BarPage from './components/BarPage';
import NestedBazPage from './components/NestedBazPage';
import { readFile } from 'node:fs/promises';

export default defineRouter({
  getRouteConfig: async () => {
    return [
      {
        pattern: '/',
        path: [],
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        elements: {
          'layout:/': { isStatic: true },
          'page:/': { isStatic: true },
        },
      },
      {
        pattern: '/foo',
        path: [{ type: 'literal', name: 'foo' }],
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        elements: {
          'layout:/': { isStatic: true },
          'page:/foo': { isStatic: true },
        },
      },
      {
        pattern: '/bar',
        path: [{ type: 'literal', name: 'bar' }],
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        elements: {
          'layout:/': { isStatic: true },
          'page:/bar': { isStatic: true },
        },
      },
      {
        pattern: '/nested/baz',
        path: [
          { type: 'literal', name: 'nested' },
          { type: 'literal', name: 'baz' },
        ],
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        elements: {
          'layout:/': { isStatic: true },
          'page:/nested/baz': { isStatic: true },
        },
      },
      {
        pattern: '/dynamic/([^/]+)',
        path: [
          { type: 'literal', name: 'dynamic' },
          { type: 'group', name: 'slug' },
        ],
        rootElement: { isStatic: true },
        routeElement: { isStatic: true },
        elements: {
          'layout:/': { isStatic: true },
          // using `[slug]` syntax is just an example and it technically conflicts with others. So, it's better to use a different prefix like `dynamic-page:`.
          'page:/dynamic/[slug]': {},
        },
      },
    ];
  },
  handleRoute: async (path) => {
    if (path === '/') {
      return {
        rootElement: (
          <Root>
            <Children />
          </Root>
        ),
        routeElement: (
          <Slot id="layout:/">
            <Slot id="page:/" />
          </Slot>
        ),
        elements: {
          'layout:/': (
            <HomeLayout>
              <Children />
            </HomeLayout>
          ),
          'page:/': <HomePage />,
        },
      };
    }
    if (path === '/foo') {
      return {
        rootElement: (
          <Root>
            <Children />
          </Root>
        ),
        routeElement: (
          <Slot id="layout:/">
            <Slot id="page:/foo" />
          </Slot>
        ),
        elements: {
          'layout:/': (
            <HomeLayout>
              <Children />
            </HomeLayout>
          ),
          'page:/foo': <FooPage />,
        },
      };
    }
    if (path === '/bar') {
      return {
        rootElement: (
          <Root>
            <Children />
          </Root>
        ),
        routeElement: (
          <Slot id="layout:/">
            <Slot id="page:/bar" />
          </Slot>
        ),
        elements: {
          'layout:/': (
            <HomeLayout>
              <Children />
            </HomeLayout>
          ),
          'page:/bar': <BarPage />,
        },
      };
    }
    if (path === '/nested/baz') {
      return {
        rootElement: (
          <Root>
            <Children />
          </Root>
        ),
        routeElement: (
          <Slot id="layout:/">
            <Slot id="page:/nested/baz" />
          </Slot>
        ),
        elements: {
          'layout:/': (
            <HomeLayout>
              <Children />
            </HomeLayout>
          ),
          'page:/nested/baz': <NestedBazPage />,
        },
      };
    }
    if (path.startsWith('/dynamic/')) {
      return {
        rootElement: (
          <Root>
            <Children />
          </Root>
        ),
        routeElement: (
          <Slot id="layout:/">
            <Slot id="page:/dynamic/[slug]" />
          </Slot>
        ),
        elements: {
          'layout:/': (
            <HomeLayout>
              <Children />
            </HomeLayout>
          ),
          'page:/dynamic/[slug]': <h3>{path}</h3>,
        },
      };
    }
    throw new Error('renderRoute: No such path:' + path);
  },
  getApiConfig: async () => [
    {
      path: [
        { type: 'literal', name: 'api' },
        { type: 'literal', name: 'hi' },
      ],
    },
    {
      path: [
        { type: 'literal', name: 'api' },
        { type: 'literal', name: 'hi.txt' },
      ],
      isStatic: true,
    },
    {
      path: [
        { type: 'literal', name: 'api' },
        { type: 'literal', name: 'empty' },
      ],
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
    } else {
      return {
        status: 404,
      };
    }
  },
});
