import { defineRouter } from 'waku/router/server';

export default defineRouter(
  // getComponent (id is "**/layout" or "**/page")
  async (id) => {
    switch (id) {
      case 'layout':
        return import('./routes/layout.js');
      case 'page':
        return import('./routes/page.js');
      case 'foo/page':
        return import('./routes/foo/page.js');
      case 'bar/page':
        return import('./routes/bar/page.js');
      case 'nested/layout':
        return import('./routes/nested/layout.js');
      case 'nested/baz/page':
        return import('./routes/nested/baz/page.js');
      case 'nested/qux/page':
        return import('./routes/nested/qux/page.js');
      default:
        return null;
    }
  },
  // getPathsForBuild
  async () => {
    return ['/', '/foo', '/bar', '/nested/baz', '/nested/qux'];
  },
);
