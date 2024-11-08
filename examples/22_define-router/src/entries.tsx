import { new_defineRouter } from 'waku/router/server';
import { Slot, Children } from 'waku/minimal/client';

import Root from './components/Root';
import HomeLayout from './components/HomeLayout';
import HomePage from './components/HomePage';
import FooPage from './components/FooPage';
import BarPage from './components/BarPage';
import NestedBazPage from './components/NestedBazPage';

export default new_defineRouter({
  getPathConfig: async () => {
    return [
      {
        pattern: '/',
        path: [],
        routeElement: { isStatic: true },
        elements: {
          root: { isStatic: true },
          'layout:/': { isStatic: true },
          'page:/': { isStatic: true },
        },
      },
      {
        pattern: '/foo',
        path: [{ type: 'literal', name: 'foo' }],
        routeElement: { isStatic: true },
        elements: {
          root: { isStatic: true },
          'layout:/': { isStatic: true },
          'page:/foo': { isStatic: true },
        },
      },
      {
        pattern: '/bar',
        path: [{ type: 'literal', name: 'bar' }],
        routeElement: { isStatic: true },
        elements: {
          root: { isStatic: true },
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
        routeElement: { isStatic: true },
        elements: {
          root: { isStatic: true },
          'layout:/': { isStatic: true },
          'page:/nested/baz': { isStatic: true },
        },
      },
    ];
  },
  renderRoute: async (path) => {
    if (path === '/') {
      return {
        routeElement: (
          <Slot id="root">
            <Slot id="layout:/">
              <Slot id="page:/" />
            </Slot>
          </Slot>
        ),
        elements: {
          root: (
            <Root>
              <Children />
            </Root>
          ),
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
        routeElement: (
          <Slot id="root">
            <Slot id="layout:/">
              <Slot id="page:/foo" />
            </Slot>
          </Slot>
        ),
        elements: {
          root: (
            <Root>
              <Children />
            </Root>
          ),
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
        routeElement: (
          <Slot id="root">
            <Slot id="layout:/">
              <Slot id="page:/bar" />
            </Slot>
          </Slot>
        ),
        elements: {
          root: (
            <Root>
              <Children />
            </Root>
          ),
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
        routeElement: (
          <Slot id="root">
            <Slot id="layout:/">
              <Slot id="page:/nested/baz" />
            </Slot>
          </Slot>
        ),
        elements: {
          root: (
            <Root>
              <Children />
            </Root>
          ),
          'layout:/': (
            <HomeLayout>
              <Children />
            </HomeLayout>
          ),
          'page:/nested/baz': <NestedBazPage />,
        },
      };
    }
    throw new Error('renderRoute: No such path:' + path);
  },
});
