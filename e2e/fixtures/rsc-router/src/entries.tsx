import { defineRouter } from 'waku/router/server';

const STATIC_PATHS = ['/', '/foo'];

export default defineRouter(
  // existsPath
  async (path: string) => (STATIC_PATHS.includes(path) ? 'static' : null),
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
  // getPathsForBuild
  async () => STATIC_PATHS,
);
