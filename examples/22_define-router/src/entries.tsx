import { new_defineRouter } from 'waku/router/server';
import { Slot, Children } from 'waku/client';

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
        components: {
          'route:/': { isStatic: true },
          root: { isStatic: true },
          'layout:/': { isStatic: true },
          'page:/': { isStatic: true },
        },
      },
      {
        pattern: '/foo',
        path: [{ type: 'literal', name: 'foo' }],
        components: {
          'route:/foo': { isStatic: true },
          root: { isStatic: true },
          'layout:/': { isStatic: true },
          'page:/foo': { isStatic: true },
        },
      },
      {
        pattern: '/bar',
        path: [{ type: 'literal', name: 'bar' }],
        components: {
          'route:/bar': { isStatic: true },
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
        components: {
          'route:/nested/baz': { isStatic: true },
          root: { isStatic: true },
          'layout:/': { isStatic: true },
          'page:/nested/baz': { isStatic: true },
        },
      },
    ];
  },
  renderRoute: async (path, options) => {
    const processSkip = <T,>(elements: Record<string, T>) =>
      Object.fromEntries(
        Object.entries(elements).filter(
          ([k]) => !options.skip || !options.skip.includes(k),
        ),
      );
    if (path === '/') {
      return processSkip({
        'route:/': (
          <Slot id="root">
            <Slot id="layout:/">
              <Slot id="page:/" />
            </Slot>
          </Slot>
        ),
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
      });
    }
    if (path === '/foo') {
      return processSkip({
        'route:/foo': (
          <Slot id="root">
            <Slot id="layout:/">
              <Slot id="page:/foo" />
            </Slot>
          </Slot>
        ),
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
      });
    }
    if (path === '/bar') {
      return processSkip({
        'route:/bar': (
          <Slot id="root">
            <Slot id="layout:/">
              <Slot id="page:/bar" />
            </Slot>
          </Slot>
        ),
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
      });
    }
    if (path === '/nested/baz') {
      return processSkip({
        'route:/nested/baz': (
          <Slot id="root">
            <Slot id="layout:/">
              <Slot id="page:/nested/baz" />
            </Slot>
          </Slot>
        ),
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
      });
    }
    throw new Error('renderRoute: No such path:' + path);
  },
});
