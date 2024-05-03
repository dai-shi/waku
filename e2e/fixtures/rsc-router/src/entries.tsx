import { unstable_defineRouter } from 'waku/router/server';

const STATIC_PATHS = ['/', '/foo'];

export default unstable_defineRouter(
  // getPathConfig
  async () =>
    STATIC_PATHS.map((path) => ({
      pattern: `^${path}$`,
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
        return (await import('./routes/layout.js')).default;
      case 'page':
        return (await import('./routes/page.js')).default;
      case 'foo/page':
        return (await import('./routes/foo/page.js')).default;
      default:
        return null;
    }
  },
);
