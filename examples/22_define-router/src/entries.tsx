import { new_defineRouter } from 'waku/router/server';
import { Slot } from 'waku/client';

import Root from './components/Root';
import HomeLayout from './components/HomeLayout';
import HomePage from './components/HomePage';
import FooPage from './components/FooPage';
import BarPage from './components/BarPage';

export default new_defineRouter({
  getPathConfig: async () => {
    return [
      {
        pattern: '/',
        path: [],
        components: {
          root: { isStatic: true },
          layout: { isStatic: true },
          page: { isStatic: true },
        },
      },
      {
        pattern: '/foo',
        path: [{ type: 'literal', name: 'foo' }],
        components: {
          root: { isStatic: true },
          layout: { isStatic: true },
          'foo/page': { isStatic: true },
        },
      },
      {
        pattern: '/bar',
        path: [{ type: 'literal', name: 'bar' }],
        components: {
          root: { isStatic: true },
          layout: { isStatic: true },
          'bar/page': { isStatic: true },
        },
      },
    ];
  },
  renderRoute: async (path, options) => {
    const processSkip = <T,>(elements: Record<string, T>) =>
      Object.fromEntries(
        Object.entries(elements).filter(
          ([k]) => !options.skip || options.skip.includes(k),
        ),
      );
    if (path === '/') {
      return processSkip({
        root: (
          <Root>
            <Slot id="layout" />
          </Root>
        ),
        layout: (
          <HomeLayout>
            <Slot id="page" />
          </HomeLayout>
        ),
        page: <HomePage />,
      });
    }
    if (path === '/foo') {
      return processSkip({
        root: (
          <Root>
            <Slot id="layout" />
          </Root>
        ),
        layout: (
          <HomeLayout>
            <Slot id="foo/page" />
          </HomeLayout>
        ),
        'foo/page': <FooPage />,
      });
    }
    if (path === '/bar') {
      return processSkip({
        root: (
          <Root>
            <Slot id="layout" />
          </Root>
        ),
        layout: (
          <HomeLayout>
            <Slot id="bar/page" />
          </HomeLayout>
        ),
        'bar/page': <BarPage />,
      });
    }
    throw new Error('renderRoute: No such path:' + path);
  },
});
