import { unstable_defineRouter as defineRouter } from 'waku/router/server';

const STATIC_PATHS = ['/', '/foo'];

export default defineRouter(
  // getPathConfig
  async () =>
    STATIC_PATHS.map((path) => ({
      path: path
        .split('/')
        .filter(Boolean)
        .map((name) => ({ type: 'literal', name })),
      isStatic: true,
    })),
  // getComponent (id is "**/layout" or "**/page")
  async (id) => {
    switch (id) {
      case 'layout':
        return import('./routes/layout.js');
      case 'page':
        return import('./routes/page.js');
      case 'foo/page':
        return import('./routes/foo/page.js');
      default:
        return null;
    }
  },
);
